import request from "supertest";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { createMetricsProxyApp } from "./app.js";

const targets = {
  paymentApi: "http://payment-api:3000/metrics",
  paymentWorker: "http://payment-worker:3001/metrics"
};
const logger = pino({ level: "silent" });

describe("metrics proxy", () => {
  it("passes through API metrics and content type", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("# TYPE api_requests_total counter\napi_requests_total 3\n", {
          status: 200,
          headers: { "content-type": "text/plain; version=0.0.4" }
        })
    ) as typeof fetch;
    const app = createMetricsProxyApp({ targets, request: fetcher, logger });

    const response = await request(app).get("/metrics/payment-api").expect(200);

    expect(response.text).toContain("api_requests_total 3");
    expect(fetcher).toHaveBeenCalledWith(
      targets.paymentApi,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("returns a scrape failure when an upstream is unavailable", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const app = createMetricsProxyApp({ targets, request: fetcher, logger });

    await request(app).get("/metrics/payment-worker").expect(502);
  });

  it("keeps liveness independent from upstream availability", async () => {
    const app = createMetricsProxyApp({ targets, logger });
    await request(app).get("/healthz").expect(200, { status: "ok" });
  });
});
