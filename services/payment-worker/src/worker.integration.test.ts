import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@chaos/database";
import { createApp } from "@chaos/payment-api";
import { Queue, type WebhookJob, redisConnection } from "@chaos/queue";
import { createSinkApp } from "@chaos/webhook-sink";
import { Redis } from "ioredis";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startWebhookWorker } from "./worker.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";
const database = createPrismaClient(databaseUrl);
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const logger = pino({ level: "silent" });
const suffix = randomUUID();
const queueName = `payment-webhooks-${suffix}`;
const deadLetterQueueName = `payment-webhooks-dlq-${suffix}`;
const queue = new Queue<WebhookJob>(queueName, { connection: redisConnection(redisUrl) });
const deadLetterQueue = new Queue<WebhookJob>(deadLetterQueueName, {
  connection: redisConnection(redisUrl)
});

let sinkServer: ReturnType<ReturnType<typeof createSinkApp>["listen"]>;
let sinkUrl: string;
let workerResources: ReturnType<typeof startWebhookWorker>;

async function eventually(assertion: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for asynchronous queue state");
}

beforeAll(async () => {
  sinkServer = createSinkApp(database, logger).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => sinkServer.once("listening", resolve));
  const address = sinkServer.address();
  if (!address || typeof address === "string") throw new Error("Sink did not bind a TCP port");
  sinkUrl = `http://127.0.0.1:${address.port}`;
  workerResources = startWebhookWorker({
    redisUrl,
    sinkUrl,
    concurrency: 2,
    logger,
    queueName,
    deadLetterQueueName
  });
});

afterAll(async () => {
  await workerResources.worker.close();
  await workerResources.deadLetter.close();
  await queue.obliterate({ force: true });
  await deadLetterQueue.obliterate({ force: true });
  await Promise.all([queue.close(), deadLetterQueue.close(), redis.quit(), database.$disconnect()]);
  await new Promise<void>((resolve, reject) =>
    sinkServer.close((error) => (error ? reject(error) : resolve()))
  );
});

describe("webhook queue pipeline", () => {
  it("delivers a newly created payment exactly once in the happy path", async () => {
    const api = createApp({ database, redis, webhookQueue: queue, logger });
    const created = await request(api)
      .post("/payments")
      .set("Idempotency-Key", `queue-${randomUUID()}`)
      .send({ amount_minor: 1100, currency: "USD" })
      .expect(201);

    await eventually(
      async () =>
        (await database.webhookDelivery.count({ where: { paymentId: created.body.id } })) === 1
    );
  });

  it("retries a failing sink and moves an exhausted job to the dead-letter queue", async () => {
    await request(sinkServer)
      .put("/mode")
      .send({ failures_remaining: 5, latency_ms: 0 })
      .expect(200);
    const payment = await database.payment.findFirstOrThrow();
    const event: WebhookJob = {
      event_id: randomUUID(),
      payment_id: payment.id,
      occurred_at: new Date().toISOString()
    };
    await queue.add("payment-created", event, {
      jobId: event.event_id,
      attempts: 2,
      backoff: { type: "fixed", delay: 10 }
    });

    await eventually(async () => (await deadLetterQueue.getJob(event.event_id)) !== undefined);
    expect(await database.webhookDelivery.count({ where: { eventId: event.event_id } })).toBe(0);
    await request(sinkServer)
      .put("/mode")
      .send({ failures_remaining: 0, latency_ms: 0 })
      .expect(200);
  });
});
