import { loadConfig } from "@chaos/config";
import { createPrismaClient } from "@chaos/database";
import pino from "pino";
import { createSinkApp } from "./app.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const database = createPrismaClient(config.DATABASE_URL);
const server = createSinkApp(database, logger).listen(config.WEBHOOK_SINK_PORT, "0.0.0.0");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down webhook sink");
  server.close(async (error) => {
    await database.$disconnect();
    process.exitCode = error ? 1 : 0;
  });
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
