import request from "supertest";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { createMetricsProxyApp } from "./app.js";

const targets = {
  paymentApi: "http://payment-api:3000/metrics",
  paymentWorker: "http://payment-worker:3001/metrics"
};
const logger = pino({ level: "silent" });
const chaosToken = "test-chaos-control-token";

describe("metrics proxy", () => {
  it("passes through API metrics and content type", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("# TYPE api_requests_total counter\napi_requests_total 3\n", {
          status: 200,
          headers: { "content-type": "text/plain; version=0.0.4" }
        })
    ) as typeof fetch;
    const app = createMetricsProxyApp({ targets, chaosToken, request: fetcher, logger });

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
    const app = createMetricsProxyApp({ targets, chaosToken, request: fetcher, logger });

    await request(app).get("/metrics/payment-worker").expect(502);
  });

  it("keeps liveness independent from upstream availability", async () => {
    const app = createMetricsProxyApp({ targets, chaosToken, logger });
    await request(app).get("/healthz").expect(200, { status: "ok" });
  });

  it("requires authorization and validates the corruption allowlist", async () => {
    const app = createMetricsProxyApp({ targets, chaosToken, logger });
    await request(app).put("/chaos/mode").send({ mode: "spike" }).expect(401);
    await request(app)
      .put("/chaos/mode")
      .set("authorization", `Bearer ${chaosToken}`)
      .send({ mode: "invented" })
      .expect(400);
    await request(app)
      .put("/chaos/mode")
      .set("authorization", `Bearer ${chaosToken}`)
      .send({ mode: "spike" })
      .expect(200, { mode: "spike" });
    await request(app)
      .get("/chaos/state")
      .set("authorization", `Bearer ${chaosToken}`)
      .expect(200, { mode: "spike" });
  });
});
