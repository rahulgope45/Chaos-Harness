import { describe, expect, it, vi } from "vitest";
import { PrometheusTelemetryMonitor } from "./telemetry.js";

function prometheusResponse(values: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      status: "success",
      data: {
        result: Object.entries(values).map(([job, value]) => ({
          metric: { job },
          value: [1_780_000_000, value]
        }))
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
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
});
