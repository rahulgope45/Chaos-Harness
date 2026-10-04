import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@chaos/database";
import { Redis } from "ioredis";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";

const database = createPrismaClient(databaseUrl);
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
const app = createApp({ database, redis, logger: pino({ level: "silent" }) });

beforeAll(async () => {
  await redis.connect();
  await database.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await Promise.all([database.$disconnect(), redis.quit()]);
});

describe("payment API", () => {
  it("replays the original response for the same key and body", async () => {
    const key = `replay-${randomUUID()}`;
    const body = { amount_minor: 1250, currency: "USD" };

    const created = await request(app).post("/payments").set("Idempotency-Key", key).send(body);
    const replayed = await request(app).post("/payments").set("Idempotency-Key", key).send(body);

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(replayed.body).toEqual(created.body);
  });

  it("returns 422 when a key is reused with a different body", async () => {
    const key = `mismatch-${randomUUID()}`;
    await request(app)
      .post("/payments")
      .set("Idempotency-Key", key)
      .send({ amount_minor: 1000, currency: "USD" })
      .expect(201);

    await request(app)
      .post("/payments")
      .set("Idempotency-Key", key)
      .send({ amount_minor: 2000, currency: "USD" })
      .expect(422);
  });

  it("creates exactly one payment during a 50-way same-key race", async () => {
    const key = `race-${randomUUID()}`;
    const body = { amount_minor: 5000, currency: "USD" };
    const responses = await Promise.all(
      Array.from({ length: 50 }, () =>
        request(app).post("/payments").set("Idempotency-Key", key).send(body)
      )
    );

    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(responses.every(({ status }) => [200, 201, 409].includes(status))).toBe(true);
    expect(await database.payment.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("retrieves a payment by id", async () => {
    const created = await request(app)
      .post("/payments")
      .set("Idempotency-Key", `get-${randomUUID()}`)
      .send({ amount_minor: 750, currency: "USD" })
      .expect(201);

    const fetched = await request(app).get(`/payments/${created.body.id}`).expect(200);
    expect(fetched.body).toEqual(created.body);
  });

  it("remains correct when Redis is unavailable", async () => {
    const unavailableRedis = new Redis({
      host: "127.0.0.1",
      port: 6399,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null
    });
    unavailableRedis.on("error", () => undefined);
    const fallbackApp = createApp({
      database,
      redis: unavailableRedis,
      logger: pino({ level: "silent" })
    });
    const key = `redis-fallback-${randomUUID()}`;

    try {
      const created = await request(fallbackApp)
        .post("/payments")
        .set("Idempotency-Key", key)
        .send({ amount_minor: 900, currency: "USD" })
        .expect(201);

      const replayed = await request(fallbackApp)
        .post("/payments")
        .set("Idempotency-Key", key)
        .send({ amount_minor: 900, currency: "USD" })
        .expect(200);

      expect(replayed.body.id).toBe(created.body.id);
      expect(await database.payment.count({ where: { idempotencyKey: key } })).toBe(1);
    } finally {
      unavailableRedis.disconnect();
    }
  });
});
