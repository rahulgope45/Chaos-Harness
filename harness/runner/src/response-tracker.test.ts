import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildResponseResult,
  ResponseEventLog,
  type ResponseEvent,
  type ResponseEventInput
} from "./response-tracker.js";

const runId = "synthetic-response-run";
const bound = { maxErrorRate: 0.02, consecutiveHealthy: 3, sampleIntervalMs: 1000 };
let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

function event(value: ResponseEventInput): ResponseEvent {
  return { run_id: runId, ...value } as ResponseEvent;
}

describe("response tracker", () => {
  it("computes MTTD, MTTR, and intermediate durations from synthetic events", () => {
    const events: ResponseEvent[] = [
      event({
        event: "fault_injected",
        at: "2026-10-04T00:00:00.000Z",
        source: "runner",
        fault: "FS_1",
        action: "kill",
        target: "payment-worker"
      }),
      event({
        event: "anomaly_detected",
        at: "2026-10-04T00:00:02.500Z",
        source: "controller",
        signal: "container_running",
        observed: 0,
        threshold: 1
      }),
      event({
        event: "plan_selected",
        at: "2026-10-04T00:00:03.000Z",
        source: "controller",
        policy_id: "restart-worker-v1",
        action: "restart",
        target: "payment-worker"
      }),
      event({
        event: "action_executed",
        at: "2026-10-04T00:00:04.250Z",
        source: "controller",
        action: "restart",
        target: "payment-worker",
        success: true
      }),
      event({
        event: "recovered",
        at: "2026-10-04T00:00:12.000Z",
        source: "runner",
        observed_error_rate: 0,
        max_error_rate: 0.02,
        consecutive_healthy: 3
      })
    ];

    const result = buildResponseResult(runId, events, bound);
    expect(result.durations_ms).toEqual({
      mttd: 2500,
      mttr: 12_000,
      detection_to_plan: 500,
      plan_to_action: 1250,
      action_to_recovery: 7750
    });
  });

  it("keeps unavailable controller timings null without inventing measurements", () => {
    const events: ResponseEvent[] = [
      event({
        event: "fault_injected",
        at: "2026-10-04T00:00:00.000Z",
        source: "runner",
        fault: "FS_1",
        action: "kill",
        target: "payment-worker"
      }),
      event({
        event: "recovered",
        at: "2026-10-04T00:00:05.000Z",
        source: "runner",
        observed_error_rate: 0,
        max_error_rate: 0.02,
        consecutive_healthy: 3
      })
    ];

    const result = buildResponseResult(runId, events, bound);
    expect(result.durations_ms.mttd).toBeNull();
    expect(result.durations_ms.mttr).toBe(5000);
    expect(result.durations_ms.detection_to_plan).toBeNull();
  });

  it("rejects impossible negative durations", () => {
    const events: ResponseEvent[] = [
      event({
        event: "fault_injected",
        at: "2026-10-04T00:00:05.000Z",
        source: "runner",
        fault: "FS_1",
        action: "kill",
        target: "payment-worker"
      }),
      event({
        event: "recovered",
        at: "2026-10-04T00:00:04.000Z",
        source: "runner",
        observed_error_rate: 0,
        max_error_rate: 0.02,
        consecutive_healthy: 3
      })
    ];

    expect(() => buildResponseResult(runId, events, bound)).toThrow(/MTTR events are out/);
  });

  it("reads events appended by a separate producer", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "chaos-response-events-"));
    const path = join(temporaryDirectory, "response-events.jsonl");
    const log = await ResponseEventLog.create(runId, path);
    await log.record({
      event: "fault_injected",
      at: "2026-10-04T00:00:00.000Z",
      source: "runner",
      fault: "FS_1",
      action: "kill",
      target: "payment-worker"
    });
    const controllerEvent = event({
      event: "anomaly_detected",
      at: "2026-10-04T00:00:02.500Z",
      source: "controller",
      signal: "container_running",
      observed: 0,
      threshold: 1
    });
    await appendFile(path, `${JSON.stringify(controllerEvent)}\n`);

    expect((await log.read()).map(({ event: name }) => name)).toEqual([
      "fault_injected",
      "anomaly_detected"
    ]);
  });

  it("preserves blind-mode alerts without treating them as anomaly detection", () => {
    const events: ResponseEvent[] = [
      event({
        event: "fault_injected",
        at: "2026-10-04T00:00:00.000Z",
        source: "runner",
        fault: "FS_3",
        action: "stop_sensor",
        target: "metrics-proxy"
      }),
      event({
        event: "telemetry_unavailable",
        at: "2026-10-04T00:00:02.000Z",
        source: "controller",
        mode: "blind",
        fallback: "docker",
        reason: "missing_or_down_targets",
        missing_jobs: ["payment-api", "payment-worker"]
      })
    ];

    const result = buildResponseResult(runId, events, bound);
    expect(result.timestamps.anomaly_detected_at).toBeNull();
    expect(result.events[1]?.event).toBe("telemetry_unavailable");
  });

  it("preserves corrupt-telemetry guard events without inventing an application anomaly", () => {
    const events: ResponseEvent[] = [
      event({
        event: "fault_injected",
        at: "2026-10-04T00:00:00.000Z",
        source: "runner",
        fault: "FS_2",
        action: "noise",
        target: "metrics-proxy"
      }),
      event({
        event: "telemetry_invalid",
        at: "2026-10-04T00:00:02.000Z",
        source: "controller",
        mode: "guarded",
        fallback: "docker",
        issues: [{ reason: "invalid_sample", metric: "chaos_metrics_proxy_integrity_value" }]
      }),
      event({
        event: "telemetry_validated",
        at: "2026-10-04T00:00:08.000Z",
        source: "controller",
        monitored_metrics: ["chaos_metrics_proxy_integrity_value"]
      })
    ];

    const result = buildResponseResult(runId, events, bound);
    expect(result.timestamps.anomaly_detected_at).toBeNull();
    expect(result.events.map(({ event: name }) => name)).toEqual([
      "fault_injected",
      "telemetry_invalid",
      "telemetry_validated"
    ]);
  });
});
