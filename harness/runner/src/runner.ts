import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LiveInvariantSource,
  exitCodeFor,
  readJournal,
  runInvariantChecks
} from "@chaos/invariants";
import { runLoad } from "@chaos/loadgen";
import type { Experiment } from "./config.js";
import { injectFs1, waitForInjection } from "./fs1.js";
import { executeLifecycle, type Phase } from "./lifecycle.js";
import { readSteadyState, type SteadyStateSnapshot } from "./prometheus.js";
import {
  SafetySession,
  resolveAllowedTarget,
  watchErrorRate,
  type TargetIdentity
} from "./safety.js";

interface RunnerOptions {
  experiment: Experiment;
  repositoryRoot: string;
  paymentApiUrl: string;
  prometheusUrl: string;
  databaseUrl: string;
  redisUrl: string;
  sinkUrl: string;
  iteration: number;
}

export async function runExperiment(options: RunnerOptions): Promise<string> {
  const { experiment } = options;
  const runId = `${experiment.name}-${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
  const artifactDirectory = join(options.repositoryRoot, "docs", "results", "experiments", runId);
  const lockPath = join(options.repositoryRoot, ".chaos-experiment.lock");
  await mkdir(artifactDirectory, { recursive: true });
  const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error("Another experiment is already running");
    throw error;
  });
  const safety = new SafetySession(experiment.max_duration_s * 1000);
  const timeline = createWriteStream(join(artifactDirectory, "timeline.jsonl"), { flags: "wx" });
  await writeFile(
    join(artifactDirectory, "experiment.json"),
    `${JSON.stringify(experiment, null, 2)}\n`,
    { flag: "wx" }
  );
  const startedAt = Date.now();
  let baseline: SteadyStateSnapshot | null = null;
  let recovery: SteadyStateSnapshot | null = null;
  let loadSummary: Awaited<ReturnType<typeof runLoad>> | null = null;
  let invariantResults: Awaited<ReturnType<typeof runInvariantChecks>> = [];
  let target: TargetIdentity | null = null;
  let faultTask: Promise<void> = Promise.resolve();

  const phase = async (name: Phase) => {
    if (safety.signal.aborted) throw safety.signal.reason;
    timeline.write(
      `${JSON.stringify({ run_id: runId, phase: name, at: new Date().toISOString() })}\n`
    );
  };

  const setSinkMode = async (responseLatencyMs: number) => {
    const response = await fetch(`${options.sinkUrl}/mode`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        failures_remaining: 0,
        latency_ms: 0,
        response_latency_ms: responseLatencyMs
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Webhook sink mode returned ${response.status}`);
  };

  try {
    await executeLifecycle({
      onPhase: phase,
      preflight: async () => {
        if (experiment.fault !== "none" && experiment.fault !== "FS_1") {
          throw new Error("Fault injection is disabled until the requested injector is installed");
        }
        target = await resolveAllowedTarget(experiment.target);
        const health = await fetch(`${options.paymentApiUrl}/healthz`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!health.ok) throw new Error(`Payment API preflight returned ${health.status}`);
        await readSteadyState(options.prometheusUrl);
      },
      baseline: async () => {
        baseline = await readSteadyState(options.prometheusUrl);
        await writeFile(
          join(artifactDirectory, "baseline.json"),
          `${JSON.stringify(baseline, null, 2)}\n`,
          {
            flag: "wx"
          }
        );
      },
      inject: async () => {
        const responseLatencyMs = experiment.conditions?.sink_response_latency_ms ?? 0;
        if (responseLatencyMs > 0) {
          safety.registerRevert(() => setSinkMode(0));
          await setSinkMode(responseLatencyMs);
        }
        if (experiment.fault !== "FS_1") return;
        if (!experiment.fs1 || !target) throw new Error("FS-1 preflight state is unavailable");
        const fs1 = experiment.fs1;
        faultTask = (async () => {
          await waitForInjection(fs1.inject_after_s * 1000, safety.signal);
          await injectFs1(target, fs1.action, safety);
          timeline.write(
            `${JSON.stringify({
              run_id: runId,
              event: "fault_injected",
              fault: "FS_1",
              action: fs1.action,
              target: experiment.target,
              at: new Date().toISOString()
            })}\n`
          );
        })();
      },
      observe: async () => {
        const loadRoot = join(artifactDirectory, "load");
        const watcherStop = new AbortController();
        const load = Promise.all([
          runLoad({
            baseUrl: options.paymentApiUrl,
            seed: experiment.seed + options.iteration,
            durationSeconds: experiment.duration_s,
            ratePerSecond: experiment.rate_per_second,
            timeoutMs: 2000,
            outputRoot: loadRoot,
            signal: safety.signal
          }),
          faultTask
        ]).then(([summary]) => summary);
        const watcher = watchErrorRate(
          () => readSteadyState(options.prometheusUrl),
          experiment.abort_if.error_rate_above,
          safety,
          watcherStop.signal
        );
        try {
          loadSummary = await Promise.race([load, watcher]);
        } finally {
          watcherStop.abort();
        }
        if (loadSummary.aborted) throw safety.signal.reason;
      },
      revert: async () => safety.revertAll(),
      recoveryWait: async () => {
        let consecutive = 0;
        const deadline = Date.now() + experiment.recovery.timeout_s * 1000;
        while (Date.now() <= deadline) {
          if (safety.signal.aborted) throw safety.signal.reason;
          recovery = await readSteadyState(options.prometheusUrl);
          consecutive =
            recovery.error_rate <= experiment.steady_state.max_error_rate ? consecutive + 1 : 0;
          if (consecutive >= experiment.recovery.consecutive_healthy) return;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error("Steady state did not recover before the configured timeout");
      },
      verify: async () => {
        if (!loadSummary) throw new Error("Load summary is unavailable");
        const journalPath = join(artifactDirectory, "load", loadSummary.run_id, "journal.jsonl");
        const source = new LiveInvariantSource(options.databaseUrl, options.redisUrl);
        try {
          invariantResults = (
            await runInvariantChecks(source, {
              journal: await readJournal(journalPath),
              faultInjected: experiment.fault !== "none",
              duplicatePolicy: "report",
              drainTimeoutMs: experiment.invariant_drain_timeout_s * 1000,
              duplicateObservationMs: experiment.duplicate_observation_s * 1000
            })
          ).filter(({ invariant }) => experiment.invariants.includes(invariant));
        } finally {
          await source.close();
        }
        await writeFile(
          join(artifactDirectory, "invariants.json"),
          `${JSON.stringify(invariantResults, null, 2)}\n`,
          { flag: "wx" }
        );
        if (exitCodeFor(invariantResults) !== 0) throw new Error("One or more invariants failed");
      },
      report: async () => {
        const report = {
          run_id: runId,
          experiment: experiment.name,
          hypothesis: experiment.hypothesis,
          fault: experiment.fault,
          target: experiment.target,
          seed: experiment.seed + options.iteration,
          started_at: new Date(startedAt).toISOString(),
          completed_at: new Date().toISOString(),
          baseline,
          recovery,
          load: loadSummary,
          invariants: invariantResults,
          status: "passed"
        };
        await writeFile(
          join(artifactDirectory, "report.json"),
          `${JSON.stringify(report, null, 2)}\n`,
          {
            flag: "wx"
          }
        );
      }
    });
    return runId;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    timeline.write(
      `${JSON.stringify({ run_id: runId, event: "run_failed", error: failure.message, at: new Date().toISOString() })}\n`
    );
    await writeFile(
      join(artifactDirectory, "report.json"),
      `${JSON.stringify(
        {
          run_id: runId,
          experiment: experiment.name,
          hypothesis: experiment.hypothesis,
          fault: experiment.fault,
          target: experiment.target,
          seed: experiment.seed + options.iteration,
          started_at: new Date(startedAt).toISOString(),
          completed_at: new Date().toISOString(),
          baseline,
          recovery,
          load: loadSummary,
          invariants: invariantResults,
          status: "failed",
          error: failure.message
        },
        null,
        2
      )}\n`,
      { flag: "wx" }
    ).catch((writeError: NodeJS.ErrnoException) => {
      if (writeError.code !== "EEXIST") throw writeError;
    });
    throw new Error(`Experiment ${runId} failed: ${failure.message}`, { cause: error });
  } finally {
    try {
      await safety.cleanup();
    } finally {
      try {
        await new Promise<void>((resolve, reject) =>
          timeline.end((error?: Error | null) => (error ? reject(error) : resolve()))
        );
      } finally {
        await lock.close();
        await rm(lockPath, { force: true });
      }
    }
  }
}
