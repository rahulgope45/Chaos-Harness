import { describe, expect, it } from "vitest";
import { MetricsCorruptor } from "./corruption.js";

const workerMetrics = `# TYPE payment_worker_jobs_completed_total counter
payment_worker_jobs_completed_total 42
# TYPE payment_worker_queue_depth gauge
payment_worker_queue_depth 3
`;

describe("metrics corruption", () => {
  it("passes through metrics with integrity canaries when disabled", () => {
    const corruptor = new MetricsCorruptor();
    const body = corruptor.transform("payment-worker", workerMetrics, 2_000);
    expect(body).toContain("payment_worker_jobs_completed_total 42");
    expect(body).toContain("chaos_metrics_proxy_source_timestamp_seconds 2");
    expect(body).toContain("chaos_metrics_proxy_scrapes_total 1");
    expect(body).toContain("chaos_metrics_proxy_integrity_value 1");
  });

  it.each([
    ["spike", "chaos_metrics_proxy_scrapes_total 1000000000000000"],
    ["drop", "# TYPE payment_worker_queue_depth gauge"],
    ["noise", "chaos_metrics_proxy_integrity_value NaN"],
    ["counter_reset", "payment_worker_jobs_completed_total 0"]
  ] as const)("applies %s corruption", (mode, evidence) => {
    const corruptor = new MetricsCorruptor();
    corruptor.setMode(mode);
    const body = corruptor.transform("payment-worker", workerMetrics, 2_000);
    if (mode === "drop") expect(body).not.toContain(evidence);
    else expect(body).toContain(evidence);
  });

  it("freezes the complete worker exposition until the mode changes", () => {
    const corruptor = new MetricsCorruptor();
    corruptor.setMode("freeze");
    const first = corruptor.transform("payment-worker", workerMetrics, 2_000);
    const second = corruptor.transform("payment-worker", workerMetrics.replace("42", "43"), 9_000);
    expect(second).toBe(first);
    corruptor.setMode("none");
    expect(corruptor.transform("payment-worker", workerMetrics, 10_000)).not.toBe(first);
  });
});
