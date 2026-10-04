import { createServer } from "node:http";
import { z } from "zod";
import pino from "pino";
import { MapekController } from "./controller.js";
import { DockerTargetManager } from "./docker-target.js";
import { JsonlControllerEventSink } from "./events.js";
import { createControllerMetrics } from "./metrics.js";
import { PostgresPolicyStore } from "./store.js";
import { PrometheusTelemetryMonitor } from "./telemetry.js";

const config = z
  .object({
    DATABASE_URL: z.string().url(),
    PROMETHEUS_URL: z.string().url().default("http://127.0.0.1:19090"),
    CONTROLLER_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
    CONTROLLER_RUN_ID: z.string().min(1).optional(),
    CONTROLLER_EVENTS_PATH: z.string().min(1).optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info")
  })
  .superRefine((value, context) => {
    if (Boolean(value.CONTROLLER_RUN_ID) !== Boolean(value.CONTROLLER_EVENTS_PATH)) {
      context.addIssue({
        code: "custom",
        message: "CONTROLLER_RUN_ID and CONTROLLER_EVENTS_PATH must be set together"
      });
    }
  })
  .parse(process.env);

const logger = pino({ level: config.LOG_LEVEL });
const store = new PostgresPolicyStore(config.DATABASE_URL);
const metrics = createControllerMetrics();
const controller = new MapekController(
  store,
  new DockerTargetManager(),
  new PrometheusTelemetryMonitor(config.PROMETHEUS_URL),
  new JsonlControllerEventSink(config.CONTROLLER_RUN_ID, config.CONTROLLER_EVENTS_PATH),
  metrics,
  logger
);
let stopping = false;

const server = createServer(async (request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.url === "/metrics") {
    response.writeHead(200, { "content-type": metrics.registry.contentType });
    response.end(await metrics.registry.metrics());
    return;
  }
  response.writeHead(404).end();
});
server.listen(config.CONTROLLER_PORT, "127.0.0.1");

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function loop(): Promise<void> {
  while (!stopping) {
    let pollMs = 1000;
    try {
      pollMs = await controller.cycle();
    } catch (error) {
      logger.error({ error }, "controller cycle failed");
    }
    if (!stopping) await delay(pollMs);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "shutting down controller");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  await store.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
await loop();
