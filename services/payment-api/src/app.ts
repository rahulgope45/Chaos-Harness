import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@chaos/database";
import type { WebhookJob } from "@chaos/queue";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Redis } from "ioredis";
import pino, { type Logger } from "pino";
import { pinoHttp } from "pino-http";
import { ZodError } from "zod";
import { createPaymentService, paymentRequestSchema } from "./payment.js";
import { createApiMetrics } from "./metrics.js";

interface AppDependencies {
  database: DatabaseClient;
  redis: Redis;
  lockTtlMs?: number;
  logger?: Logger;
  webhookQueue?: { add(name: string, data: WebhookJob, options: object): Promise<unknown> };
}

export function createApp({
  database,
  redis,
  lockTtlMs = 5000,
  logger = pino({ level: "info" }),
  webhookQueue
}: AppDependencies) {
  const app = express();
  const payments = createPaymentService({ database, redis, lockTtlMs });
  const metrics = createApiMetrics();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(
    pinoHttp({
      logger,
      genReqId(request, response) {
        const supplied = request.headers["x-request-id"];
        const requestId = typeof supplied === "string" && supplied ? supplied : randomUUID();
        response.setHeader("x-request-id", requestId);
        return requestId;
      }
    })
  );
  app.use(metrics.middleware);

  app.get("/metrics", async (_request, response) => {
    response.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/readyz", async (_request, response, next) => {
    try {
      await database.$queryRaw`SELECT 1`;
      await redis.ping();
      response.status(200).json({ status: "ready" });
    } catch (error) {
      next(
        Object.assign(new Error("Dependency readiness check failed"), { cause: error, status: 503 })
      );
    }
  });

  app.post("/payments", async (request, response, next) => {
    try {
      const idempotencyKey = request.header("Idempotency-Key")?.trim();
      if (!idempotencyKey) {
        response.status(400).json({ error: "Idempotency-Key header is required" });
        return;
      }
      if (idempotencyKey.length > 255) {
        response.status(400).json({ error: "Idempotency-Key must be at most 255 characters" });
        return;
      }

      const body = paymentRequestSchema.parse(request.body);
      const result = await payments.createPayment(idempotencyKey, body);

      switch (result.kind) {
        case "created":
          if (webhookQueue) {
            const event: WebhookJob = {
              event_id: randomUUID(),
              payment_id: result.payment.id,
              occurred_at: new Date().toISOString()
            };
            await webhookQueue.add("payment-created", event, {
              jobId: event.event_id,
              attempts: 3,
              backoff: { type: "exponential", delay: 1000 },
              removeOnComplete: 1000,
              removeOnFail: false
            });
          }
          response.status(201).json(result.payment);
          return;
        case "replayed":
          response.status(200).json(result.payment);
          return;
        case "mismatch":
          response
            .status(422)
            .json({ error: "Idempotency key was already used with a different request" });
          return;
        case "in_flight":
          response
            .status(409)
            .json({ error: "A request with this idempotency key is already in flight" });
          return;
      }
    } catch (error) {
      next(error);
    }
  });

  app.get("/payments/:id", async (request, response, next) => {
    try {
      const payment = await payments.getPayment(request.params.id ?? "");
      if (!payment) {
        response.status(404).json({ error: "Payment not found" });
        return;
      }
      response.status(200).json(payment);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    void next;
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid request", issues: error.issues });
      return;
    }

    const status =
      typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    request.log.error({ err: error }, "request failed");
    response
      .status(Number.isInteger(status) ? status : 500)
      .json({ error: "Internal server error" });
  });

  return app;
}
