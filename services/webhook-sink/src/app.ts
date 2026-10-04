import type { DatabaseClient } from "@chaos/database";
import express, { type NextFunction, type Request, type Response } from "express";
import pino, { type Logger } from "pino";
import { pinoHttp } from "pino-http";
import { z, ZodError } from "zod";

const eventSchema = z.object({
  event_id: z.string().min(1),
  payment_id: z.string().uuid(),
  occurred_at: z.string().datetime()
});
const modeSchema = z.object({
  failures_remaining: z.number().int().nonnegative().default(0),
  latency_ms: z.number().int().nonnegative().max(30_000).default(0)
});

export function createSinkApp(database: DatabaseClient, logger: Logger = pino()) {
  const app = express();
  let mode = { failures_remaining: 0, latency_ms: 0 };
  app.use(express.json({ limit: "16kb" }), pinoHttp({ logger }));

  app.get("/healthz", (_request, response) => response.json({ status: "ok" }));
  app.put("/mode", (request, response) => {
    mode = modeSchema.parse(request.body);
    response.json(mode);
  });
  app.get("/deliveries", async (_request, response) => {
    response.json(await database.webhookDelivery.findMany({ orderBy: { receivedAt: "asc" } }));
  });
  app.post("/webhooks/payment", async (request, response, next) => {
    try {
      const event = eventSchema.parse(request.body);
      if (mode.latency_ms > 0) {
        await new Promise((resolve) => setTimeout(resolve, mode.latency_ms));
      }
      if (mode.failures_remaining > 0) {
        mode.failures_remaining -= 1;
        response.status(503).json({ error: "Configured sink failure" });
        return;
      }
      await database.webhookDelivery.create({
        data: { eventId: event.event_id, paymentId: event.payment_id }
      });
      response.status(202).json({ accepted: true });
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
    request.log.error({ err: error }, "sink request failed");
    response.status(500).json({ error: "Internal server error" });
  });
  return app;
}
