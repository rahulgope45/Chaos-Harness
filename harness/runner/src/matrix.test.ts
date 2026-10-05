import { describe, expect, it } from "vitest";
import { experimentSchema } from "./config.js";
import {
  buildMatrixAggregate,
  materializeMatrixExperiment,
  matrixManifestSchema,
  renderMatrixMarkdown,
  selectInjectionOffset,
  summarizeNumbers,
  waitForMatrixReadiness,
  type MatrixRunRecord
} from "./matrix.js";
import { responseResultSchema } from "./response-tracker.js";

const manifest = matrixManifestSchema.parse({
  schema_version: 1,
  name: "test-matrix",
  minimum_repeats: 10,
  required_faults: ["FS_1"],
  experiments: [
    {
      config: "experiments/worker.yml",
      repeats: 10,
      injection_offset_s: { min: 1, max: 3 }
    }
  ]
});

const experiment = experimentSchema.parse({
  name: "worker-kill",
  hypothesis: "A worker kill is detected and safely recovered.",
  target: "payment-worker",
  fault: "FS_1",
  fs1: { action: "kill", inject_after_s: 2 },
  seed: 100,
  repeat: 1,
  duration_s: 10,
  steady_state: { max_error_rate: 0.02 },
  abort_if: { error_rate_above: 0.1 },
  invariants: ["I1"]
});

function record(index: number): MatrixRunRecord {
  const response = responseResultSchema.parse({
    schema_version: 1,
    run_id: `run-${index}`,
    definitions: {
      mttd: "anomaly_detected.at - fault_injected.at",
      mttr: "recovered.at - fault_injected.at"
    },
    recovery_bound: { max_error_rate: 0.02, consecutive_healthy: 2, sample_interval_ms: 1000 },
    timestamps: {
      fault_injected_at: null,
      anomaly_detected_at: null,
      plan_selected_at: null,
      action_executed_at: null,
      recovered_at: null
    },
    durations_ms: {
      mttd: 100 + index,
      mttr: 1000 + index,
      detection_to_plan: null,
      plan_to_action: null,
      action_to_recovery: null
    },
    events: []
  });
  return {
    config: "experiments/worker.yml",
    repeat_index: index,
    injection_offset_s: 1 + index / 10,
    report: {
      run_id: `run-${index}`,
      experiment: "worker-kill",
      fault: "FS_1",
      seed: 100 + index,
      response,
      load: { client_p95_ms: 10 + index, successful_operations: 10, failed_operations: 0 },
      invariants: [{ invariant: "I1", status: index === 9 ? "report" : "pass" }],
      status: "passed"
    }
  };
}

describe("matrix orchestration", () => {
  it("enforces at least ten repeats", () => {
    expect(() =>
      matrixManifestSchema.parse({
        schema_version: 1,
        name: "too-small",
        experiments: [{ config: "experiment.yml", repeats: 9 }]
      })
    ).toThrow();
  });

  it("materializes reproducible seeds and varied bounded offsets", () => {
    const offsets = Array.from({ length: 10 }, (_, index) =>
      selectInjectionOffset(100, index, { min: 1, max: 3 })
    );
    expect(new Set(offsets).size).toBeGreaterThan(1);
    expect(offsets.every((offset) => offset >= 1 && offset < 3)).toBe(true);
    expect(selectInjectionOffset(100, 4, { min: 1, max: 3 })).toBe(offsets[4]);

    const materialized = materializeMatrixExperiment(experiment, 4, { min: 1, max: 3 });
    expect(materialized.experiment.seed).toBe(104);
    expect(materialized.experiment.repeat).toBe(1);
    expect(materialized.experiment.fs1?.inject_after_s).toBe(materialized.injectionOffsetSeconds);
  });

  it("does not turn missing timings into zeroes", () => {
    expect(summarizeNumbers([null, 10, 20, null], 4)).toEqual({
      sample_count: 2,
      missing_count: 2,
      median: 15,
      p90: 20,
      min: 10,
      max: 20
    });
    expect(summarizeNumbers([null, null], 2).median).toBeNull();
  });

  it("waits for the suite to become ready between repeats", async () => {
    let attempts = 0;
    await expect(
      waitForMatrixReadiness(
        async () => {
          attempts += 1;
          return attempts === 3;
        },
        { timeoutMs: 100, pollMs: 1 }
      )
    ).resolves.toBeUndefined();
    expect(attempts).toBe(3);
  });

  it("aggregates response statistics, invariant rates, and exact run IDs", () => {
    const records = Array.from({ length: 10 }, (_, index) => record(index));
    const aggregate = buildMatrixAggregate(manifest, records, "2026-10-05T00:00:00.000Z");
    expect(aggregate.status).toBe("complete");
    expect(aggregate.totals).toEqual({
      planned_runs: 10,
      completed_runs: 10,
      passed_runs: 10,
      failed_runs: 0
    });
    expect(aggregate.fault_classes[0]?.mttd_ms).toMatchObject({
      sample_count: 10,
      median: 104.5,
      p90: 108,
      min: 100,
      max: 109
    });
    expect(aggregate.fault_classes[0]?.invariants.I1).toMatchObject({
      pass_count: 9,
      report_count: 1,
      pass_rate: 0.9,
      non_failure_rate: 1
    });
    expect(aggregate.experiments[0]?.run_ids).toHaveLength(10);
    expect(renderMatrixMarkdown(aggregate)).toContain("run-9");
  });
});
