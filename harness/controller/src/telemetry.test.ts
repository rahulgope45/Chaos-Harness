import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MONITORED_METRICS, PrometheusTelemetryMonitor } from "./telemetry.js";

function prometheusResponse(
  values: Record<string, string>,
  timestamp = Date.now() / 1000
): Response {
  return new Response(
    JSON.stringify({
      status: "success",
      data: {
        result: Object.entries(values).map(([name, value]) => ({
          metric: name.startsWith("payment-")
            ? { job: name }
            : { __name__: name, job: "payment-worker" },
          value: [timestamp, value]
        }))
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function healthyMetrics(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    chaos_metrics_proxy_source_timestamp_seconds: String(Date.now() / 1000),
    chaos_metrics_proxy_scrapes_total: "20",
    chaos_metrics_proxy_integrity_value: "1",
    payment_worker_queue_depth: "0",
    payment_worker_jobs_completed_total: "100",
    ...overrides
  };
}

function monitorForMetrics(...snapshots: Array<Record<string, string>>) {
  let snapshot = 0;
  const request = vi.fn(async (input: string | URL | Request) => {
    const query = new URL(String(input)).searchParams.get("query") ?? "";
    if (query.startsWith("up")) {
      return prometheusResponse({ "payment-api": "1", "payment-worker": "1" });
    }
    const index = Math.min(snapshot++, snapshots.length - 1);
    return prometheusResponse(snapshots[index] ?? {}, Date.now() / 1000 + index);
  }) as typeof fetch;
  return new PrometheusTelemetryMonitor("http://prometheus:9090", request);
}

describe("Prometheus telemetry monitor", () => {
  it("requires every monitored scrape target to be up", async () => {
    const request = vi.fn(async () =>
      prometheusResponse({ "payment-api": "1", "payment-worker": "0" })
    ) as typeof fetch;
    const monitor = new PrometheusTelemetryMonitor("http://prometheus:9090", request);

    const snapshot = await monitor.observe();

    expect(snapshot.available).toBe(false);
    expect(snapshot.missingJobs).toEqual(["payment-worker"]);
    expect(snapshot.reason).toBe("missing_or_down_targets");
  });

  it("treats an unavailable Prometheus server as blind mode", async () => {
    const request = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const monitor = new PrometheusTelemetryMonitor("http://prometheus:9090", request);

    const snapshot = await monitor.observe();

    expect(snapshot.available).toBe(false);
    expect(snapshot.missingJobs).toEqual(["payment-api", "payment-worker"]);
    expect(snapshot.reason).toBe("prometheus_unavailable");
  });

  it("accepts complete, fresh, bounded, monotonic telemetry", async () => {
    const snapshot = await monitorForMetrics(healthyMetrics()).observe();
    expect(snapshot.available).toBe(true);
    expect(snapshot.valid).toBe(true);
    expect(snapshot.monitoredMetrics).toEqual([...DEFAULT_MONITORED_METRICS]);
  });

  it.each([
    [
      "missing_required_series",
      Object.fromEntries(
        Object.entries(healthyMetrics()).filter(([name]) => name !== "payment_worker_queue_depth")
      )
    ],
    ["out_of_bounds", healthyMetrics({ payment_worker_queue_depth: "1000000000000" })],
    [
      "stale_sample",
      healthyMetrics({
        chaos_metrics_proxy_source_timestamp_seconds: String((Date.now() - 20_000) / 1000)
      })
    ],
    ["invalid_sample", healthyMetrics({ chaos_metrics_proxy_integrity_value: "NaN" })]
  ] as const)("detects %s telemetry", async (reason, metrics) => {
    const snapshot = await monitorForMetrics(metrics).observe();
    expect(snapshot.available).toBe(true);
    expect(snapshot.valid).toBe(false);
    if (!snapshot.valid) expect(snapshot.issues.map((issue) => issue.reason)).toContain(reason);
  });

  it("detects a counter reset only on a newer Prometheus sample", async () => {
    const monitor = monitorForMetrics(
      healthyMetrics({ chaos_metrics_proxy_scrapes_total: "20" }),
      healthyMetrics({ chaos_metrics_proxy_scrapes_total: "0" })
    );
    expect((await monitor.observe()).valid).toBe(true);
    const reset = await monitor.observe();
    expect(reset.valid).toBe(false);
    if (!reset.valid) expect(reset.issues.map((issue) => issue.reason)).toContain("counter_reset");
  });
});
