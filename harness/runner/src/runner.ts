import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { once } from "node:events";
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
import { injectFs3SensorStop } from "./fs3.js";
import { ToxiproxyClient, toxicDefinition } from "./fs4.js";
import { executeLifecycle, type Phase } from "./lifecycle.js";
import { readScrapeAvailability, readSteadyState, type SteadyStateSnapshot } from "./prometheus.js";
import { buildResponseResult, ResponseEventLog } from "./response-tracker.js";
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
  toxiproxyUrl: string;
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
  const toxiproxy = new ToxiproxyClient(options.toxiproxyUrl);
  const timeline = createWriteStream(join(artifactDirectory, "timeline.jsonl"), { flags: "wx" });
  const responseEvents = await ResponseEventLog.create(
    runId,
    join(artifactDirectory, "response-events.jsonl")
  );
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
  let controllerProcess: ChildProcess | null = null;
  let controllerLog: ReturnType<typeof createWriteStream> | null = null;
  const responseSampleIntervalMs = 1000;

  const effectiveRecoveryErrorRate = () =>
    Math.max(experiment.steady_state.max_error_rate, baseline?.error_rate ?? 0);
  const responseResult = async () =>
    buildResponseResult(runId, await responseEvents.read(), {
      maxErrorRate: effectiveRecoveryErrorRate(),
      consecutiveHealthy: experiment.recovery.consecutive_healthy,
      sampleIntervalMs: responseSampleIntervalMs
    });

  const phase = async (name: Phase) => {
    if (safety.signal.aborted) throw safety.signal.reason;
    timeline.write(
      `${JSON.stringify({ run_id: runId, phase: name, at: new Date().toISOString() })}\n`
    );
  };

  const startController = async () => {
    if (!experiment.controller.enabled) return;
    const require = createRequire(import.meta.url);
    const tsxCli = require.resolve("tsx/cli");
    controllerLog = createWriteStream(join(artifactDirectory, "controller.log"), { flags: "wx" });
    await once(controllerLog, "open");
    controllerProcess = spawn(
      process.execPath,
      [tsxCli, join(options.repositoryRoot, "harness", "controller", "src", "server.ts")],
      {
        cwd: options.repositoryRoot,
        env: {
          ...process.env,
          DATABASE_URL: options.databaseUrl,
          CONTROLLER_PORT: String(experiment.controller.port),
          PROMETHEUS_URL: options.prometheusUrl,
          CONTROLLER_RUN_ID: runId,
          CONTROLLER_EVENTS_PATH: join(artifactDirectory, "response-events.jsonl")
        },
        stdio: ["ignore", controllerLog, controllerLog]
      }
    );
    const deadline = Date.now() + 10_000;
    while (Date.now() <= deadline) {
      if (controllerProcess.exitCode !== null) {
        throw new Error(`Controller exited during startup with ${controllerProcess.exitCode}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${experiment.controller.port}/healthz`, {
          signal: AbortSignal.timeout(500)
        });
        if (response.ok) return;
      } catch {
        // The child is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Controller did not become healthy before startup timeout");
  };

  const stopController = async () => {
    const child = controllerProcess;
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
          resolve();
        }, 5000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await new Promise<void>(
      (resolve, reject) =>
        controllerLog?.end((error?: Error | null) => (error ? reject(error) : resolve())) ??
        resolve()
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
        if (!["none", "FS_1", "FS_3", "FS_4"].includes(experiment.fault)) {
          throw new Error("Fault injection is disabled until the requested injector is installed");
        }
        if (["none", "FS_1", "FS_3"].includes(experiment.fault)) {
          target = await resolveAllowedTarget(experiment.target);
        }
        if (experiment.fault === "FS_3") {
          const telemetry = await readScrapeAvailability(options.prometheusUrl, [
            "payment-api",
            "payment-worker"
          ]);
          if (!telemetry.available) {
            throw new Error(
              `FS-3 preflight requires healthy telemetry: ${telemetry.missing_jobs.join(", ")}`
            );
          }
        }
        if (experiment.fault === "FS_4") {
          if (!experiment.fs4) throw new Error("FS-4 preflight options are unavailable");
          await toxiproxy.assertProxy(experiment.fs4.proxy);
        }
        const health = await fetch(`${options.paymentApiUrl}/healthz`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!health.ok) throw new Error(`Payment API preflight returned ${health.status}`);
        await readSteadyState(options.prometheusUrl);
        await startController();
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
        if (experiment.fault === "FS_4") {
          if (!experiment.fs4) throw new Error("FS-4 preflight state is unavailable");
          const fs4 = experiment.fs4;
          const toxicName = `chaos-${runId}`;
          safety.registerRevert(() => toxiproxy.removeToxic(fs4.proxy, toxicName));
          faultTask = (async () => {
            await waitForInjection(fs4.inject_after_s * 1000, safety.signal);
            await toxiproxy.addToxic(fs4.proxy, toxicDefinition(fs4, toxicName));
            const injectedAt = new Date().toISOString();
            await responseEvents.record({
              event: "fault_injected",
              at: injectedAt,
              source: "runner",
              fault: "FS_4",
              action: fs4.toxic,
              target: fs4.proxy
            });
            timeline.write(
              `${JSON.stringify({
                run_id: runId,
                event: "fault_injected",
                fault: "FS_4",
                action: fs4.toxic,
                target: fs4.proxy,
                at: injectedAt
              })}\n`
            );
          })();
          return;
        }
        if (experiment.fault === "FS_3") {
          if (!experiment.fs3 || !target) throw new Error("FS-3 preflight state is unavailable");
          const fs3 = experiment.fs3;
          faultTask = (async () => {
            await waitForInjection(fs3.inject_after_s * 1000, safety.signal);
            await injectFs3SensorStop(target, safety);
            const injectedAt = new Date().toISOString();
            await responseEvents.record({
              event: "fault_injected",
              at: injectedAt,
              source: "runner",
              fault: "FS_3",
              action: "stop_sensor",
              target: experiment.target
            });
            timeline.write(
              `${JSON.stringify({
                run_id: runId,
                event: "fault_injected",
                fault: "FS_3",
                action: "stop_sensor",
                target: experiment.target,
                at: injectedAt
              })}\n`
            );
          })();
          return;
        }
        if (experiment.fault !== "FS_1") return;
        if (!experiment.fs1 || !target) throw new Error("FS-1 preflight state is unavailable");
        const fs1 = experiment.fs1;
        faultTask = (async () => {
          await waitForInjection(fs1.inject_after_s * 1000, safety.signal);
          await injectFs1(target, fs1.action, safety);
          const injectedAt = new Date().toISOString();
          await responseEvents.record({
            event: "fault_injected",
            at: injectedAt,
            source: "runner",
            fault: "FS_1",
            action: fs1.action,
            target: experiment.target
          });
          timeline.write(
            `${JSON.stringify({
              run_id: runId,
              event: "fault_injected",
              fault: "FS_1",
              action: fs1.action,
              target: experiment.target,
              at: injectedAt
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
        const maxErrorRate = effectiveRecoveryErrorRate();
        while (Date.now() <= deadline) {
          if (safety.signal.aborted) throw safety.signal.reason;
          if (experiment.fault === "FS_3") {
            const telemetry = await readScrapeAvailability(options.prometheusUrl, [
              "payment-api",
              "payment-worker"
            ]);
            if (!telemetry.available) {
              consecutive = 0;
              await new Promise((resolve) => setTimeout(resolve, responseSampleIntervalMs));
              continue;
            }
          }
          recovery = await readSteadyState(options.prometheusUrl);
          consecutive = recovery.error_rate <= maxErrorRate ? consecutive + 1 : 0;
          if (consecutive >= experiment.recovery.consecutive_healthy) {
            if (experiment.fault !== "none") {
              await responseEvents.record({
                event: "recovered",
                at: new Date().toISOString(),
                source: "runner",
                observed_error_rate: recovery.error_rate,
                max_error_rate: maxErrorRate,
                consecutive_healthy: consecutive
              });
            }
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, responseSampleIntervalMs));
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
          response: await responseResult(),
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
    const response = await responseResult();
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
          response,
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
      await stopController();
    } finally {
      try {
        await writeFile(
          join(artifactDirectory, "response.json"),
          `${JSON.stringify(await responseResult(), null, 2)}\n`,
          { flag: "wx" }
        );
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
  }
}
