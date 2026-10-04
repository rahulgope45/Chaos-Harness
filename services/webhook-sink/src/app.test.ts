import type { DatabaseClient } from "@chaos/database";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSinkApp } from "./app.js";

describe("webhook sink response delay", () => {
  it("persists the side effect before delaying its acknowledgement", async () => {
    vi.useFakeTimers();
    const create = vi.fn(async () => ({ id: "delivery" }));
    const database = {
      webhookDelivery: { create, findMany: vi.fn(async () => []) }
    } as unknown as DatabaseClient;
    const app = createSinkApp(database, pino({ level: "silent" }));
    await request(app)
      .put("/mode")
      .send({ failures_remaining: 0, latency_ms: 0, response_latency_ms: 1000 })
      .expect(200);
    const response = request(app)
      .post("/webhooks/payment")
      .send({
        event_id: "event-one",
        payment_id: "00000000-0000-4000-8000-000000000001",
        occurred_at: "2026-10-04T00:00:00.000Z"
      })
      .then((result) => result);
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(1000);
    expect((await response).status).toBe(202);
    vi.useRealTimers();
  });
});
