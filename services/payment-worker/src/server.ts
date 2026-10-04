import { loadConfig } from "@chaos/config";
import pino from "pino";
import { startWebhookWorker } from "./worker.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const { worker, deadLetter } = startWebhookWorker({
  redisUrl: config.REDIS_URL,
  sinkUrl: config.WEBHOOK_SINK_URL,
  concurrency: config.WORKER_CONCURRENCY,
  logger
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down payment worker");
  await worker.close();
  await deadLetter.close();
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
