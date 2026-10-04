import { loadConfig } from "@chaos/config";
import { createServer } from "node:http";
import pino from "pino";
import { startWebhookWorker } from "./worker.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const resources = startWebhookWorker({
  redisUrl: config.REDIS_URL,
  sinkUrl: config.WEBHOOK_SINK_URL,
  concurrency: config.WORKER_CONCURRENCY,
  logger
});
const metricsServer = createServer(async (request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.url === "/metrics") {
    response.writeHead(200, { "content-type": resources.metrics.registry.contentType });
    response.end(await resources.metrics.registry.metrics());
    return;
  }
  response.writeHead(404).end();
});
metricsServer.listen(config.WORKER_METRICS_PORT, "0.0.0.0");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down payment worker");
  metricsServer.close();
  await resources.worker.close();
  await resources.deadLetter.close();
  await resources.sourceQueue.close();
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
