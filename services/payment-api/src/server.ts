import { loadConfig } from "@chaos/config";
import { createPrismaClient } from "@chaos/database";
import { Redis } from "ioredis";
import pino from "pino";
import { createApp } from "./app.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const database = createPrismaClient(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });

redis.on("error", (error) => {
  logger.warn({ err: error }, "redis unavailable; payment correctness will use PostgreSQL");
});

await redis.connect().catch(() => undefined);

const app = createApp({ database, redis, lockTtlMs: config.REDIS_LOCK_TTL_MS, logger });
const server = app.listen(config.PAYMENT_API_PORT, "0.0.0.0", () => {
  logger.info({ port: config.PAYMENT_API_PORT }, "payment API listening");
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down payment API");

  server.close(async (error) => {
    await Promise.allSettled([database.$disconnect(), redis.quit()]);
    process.exitCode = error ? 1 : 0;
  });

  setTimeout(() => {
    logger.error("graceful shutdown timed out");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
