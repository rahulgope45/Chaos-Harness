import { afterEach, describe, expect, it, vi } from "vitest";
import { readTelemetryGuard } from "./prometheus.js";

function response(values: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      status: "success",
      data: {
        result: Object.entries(values).map(([name, value]) => ({
          metric: { __name__: name },
          value: [Date.now() / 1000, value]
        }))
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

const healthy = () => ({
  chaos_metrics_proxy_source_timestamp_seconds: String(Date.now() / 1000),
  chaos_metrics_proxy_scrapes_total: "4",
  chaos_metrics_proxy_integrity_value: "1",
  payment_worker_queue_depth: "0",
  payment_worker_jobs_completed_total: "3"
});

afterEach(() => vi.unstubAllGlobals());

describe("runner telemetry guard", () => {
  it("accepts the complete proxy integrity contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(healthy()))
    );
    expect((await readTelemetryGuard("http://prometheus:9090")).valid).toBe(true);
  });

  it("reports missing and corrupt preflight telemetry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ ...healthy(), chaos_metrics_proxy_integrity_value: "NaN" }))
    );
    const result = await readTelemetryGuard("http://prometheus:9090");
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("non_finite:chaos_metrics_proxy_integrity_value");
  });
});
