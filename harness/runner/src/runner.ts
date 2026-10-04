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
import { executeLifecycle, type Phase } from "./lifecycle.js";
import { readSteadyState, type SteadyStateSnapshot } from "./prometheus.js";
import { SafetySession, resolveAllowedTarget, watchErrorRate } from "./safety.js";

interface RunnerOptions {
  experiment: Experiment;
  repositoryRoot: string;
  paymentApiUrl: string;
  prometheusUrl: string;
  databaseUrl: string;
  redisUrl: string;
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

  const phase = async (name: Phase) => {
    if (safety.signal.aborted) throw safety.signal.reason;
    timeline.write(
      `${JSON.stringify({ run_id: runId, phase: name, at: new Date().toISOString() })}\n`
    );
  };

  try {
    await executeLifecycle({
      onPhase: phase,
      preflight: async () => {
        if (experiment.fault !== "none") {
          throw new Error("Fault injection is disabled until the requested injector is installed");
        }
        await resolveAllowedTarget(experiment.target);
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
      inject: async () => undefined,
      observe: async () => {
        const loadRoot = join(artifactDirectory, "load");
        const watcherStop = new AbortController();
        const load = runLoad({
          baseUrl: options.paymentApiUrl,
          seed: experiment.seed + options.iteration,
          durationSeconds: experiment.duration_s,
          ratePerSecond: experiment.rate_per_second,
          timeoutMs: 2000,
          outputRoot: loadRoot,
          signal: safety.signal
        });
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
              faultInjected: false,
              duplicatePolicy: "report",
              drainTimeoutMs: 5000
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
