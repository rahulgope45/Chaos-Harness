import { loadConfig } from "@chaos/config";
import pino from "pino";
import { createMetricsProxyApp } from "./app.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const app = createMetricsProxyApp({
  targets: {
    paymentApi: config.PAYMENT_API_METRICS_URL,
    paymentWorker: config.PAYMENT_WORKER_METRICS_URL
  },
  logger
});

const server = app.listen(config.METRICS_PROXY_PORT, "0.0.0.0", () => {
  logger.info({ port: config.METRICS_PROXY_PORT }, "metrics proxy listening");
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "shutting down metrics proxy");
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
