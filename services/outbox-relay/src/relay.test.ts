import type { DatabaseClient } from "@chaos/database";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { publishOutboxBatch, type OutboxQueue } from "./relay.js";

const row = {
  eventId: "00000000-0000-4000-8000-000000000001",
  paymentId: "00000000-0000-4000-8000-000000000002",
  occurredAt: new Date("2026-10-05T00:00:00.000Z"),
  createdAt: new Date("2026-10-05T00:00:00.000Z"),
  publishedAt: null,
  publishAttempts: 0,
  lastError: null
};

function dependencies(add: OutboxQueue["add"]) {
  const findMany = vi.fn(async () => [row]);
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const database = {
    webhookOutbox: { findMany, updateMany }
  } as unknown as DatabaseClient;
  return {
    database,
    queue: { add },
    logger: pino({ level: "silent" }),
    batchSize: 50,
    findMany,
    updateMany
  };
}

describe("outbox relay", () => {
  it("publishes with the event ID as the deterministic BullMQ job ID", async () => {
    const add = vi.fn(async () => ({ id: row.eventId }));
    const values = dependencies(add);

    const result = await publishOutboxBatch(values);

    expect(result).toEqual({ selected: 1, published: 1, failed: 0 });
    expect(add).toHaveBeenCalledWith(
      "payment-created",
      {
        event_id: row.eventId,
        payment_id: row.paymentId,
        occurred_at: row.occurredAt.toISOString()
      },
      expect.objectContaining({ jobId: row.eventId, attempts: 3 })
    );
    expect(values.updateMany).toHaveBeenCalledWith({
      where: { eventId: row.eventId, publishedAt: null },
      data: {
        publishedAt: expect.any(Date),
        publishAttempts: { increment: 1 },
        lastError: null
      }
    });
  });

  it("keeps a failed row pending and records its retry evidence", async () => {
    const values = dependencies(vi.fn(async () => Promise.reject(new Error("redis down"))));

    const result = await publishOutboxBatch(values);

    expect(result).toEqual({ selected: 1, published: 0, failed: 1 });
    expect(values.updateMany).toHaveBeenCalledWith({
      where: { eventId: row.eventId, publishedAt: null },
      data: { publishAttempts: { increment: 1 }, lastError: "redis down" }
    });
  });
});
