import { loadConfig } from "@chaos/config";
import { createPrismaClient } from "@chaos/database";
import { Queue, WEBHOOK_QUEUE, redisConnection, type WebhookJob } from "@chaos/queue";
import { createServer } from "node:http";
import pino from "pino";
import { startOutboxRelay } from "./relay.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const database = createPrismaClient(config.DATABASE_URL);
const queue = new Queue<WebhookJob>(WEBHOOK_QUEUE, {
  connection: redisConnection(config.REDIS_URL)
});
const relay = startOutboxRelay({
  database,
  queue,
  logger,
  batchSize: config.OUTBOX_RELAY_BATCH_SIZE,
  pollMs: config.OUTBOX_RELAY_POLL_MS
});

const server = createServer(async (request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.url === "/readyz") {
    try {
      await database.$queryRaw`SELECT 1`;
      await queue.getJobCounts("waiting");
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"ready"}');
    } catch (error) {
      logger.warn({ err: error }, "outbox relay readiness failed");
      response.writeHead(503, { "content-type": "application/json" });
      response.end('{"status":"not_ready"}');
    }
    return;
  }
  response.writeHead(404).end();
});
server.listen(config.OUTBOX_RELAY_PORT, "0.0.0.0", () => {
  logger.info({ port: config.OUTBOX_RELAY_PORT }, "outbox relay listening");
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "shutting down outbox relay");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  await relay.stop();
  await Promise.allSettled([queue.close(), database.$disconnect()]);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
