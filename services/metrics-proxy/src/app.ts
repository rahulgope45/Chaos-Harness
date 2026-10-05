import express, { type Request, type Response } from "express";
import pino, { type Logger } from "pino";
import { pinoHttp } from "pino-http";
import { isCorruptionMode, MetricsCorruptor, type MetricsTarget } from "./corruption.js";

export interface MetricsTargets {
  paymentApi: string;
  paymentWorker: string;
}

interface MetricsProxyDependencies {
  targets: MetricsTargets;
  chaosToken: string;
  request?: typeof fetch;
  logger?: Logger;
  corruptor?: MetricsCorruptor;
}

export function createMetricsProxyApp({
  targets,
  chaosToken,
  request = fetch,
  logger = pino({ level: "info" }),
  corruptor = new MetricsCorruptor()
}: MetricsProxyDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "1kb" }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  const authorizeChaos = (request: Request, response: Response): boolean => {
    if (request.headers.authorization === `Bearer ${chaosToken}`) return true;
    response.status(401).json({ error: "unauthorized" });
    return false;
  };

  app.get("/chaos/state", (request, response) => {
    if (!authorizeChaos(request, response)) return;
    response.status(200).json({ mode: corruptor.getMode() });
  });

  app.put("/chaos/mode", (request, response) => {
    if (!authorizeChaos(request, response)) return;
    const mode: unknown = (request.body as { mode?: unknown } | undefined)?.mode;
    if (!isCorruptionMode(mode)) {
      response.status(400).json({ error: "invalid corruption mode" });
      return;
    }
    corruptor.setMode(mode);
    logger.warn({ mode }, "metrics corruption mode changed");
    response.status(200).json({ mode });
  });

  const proxy =
    (target: MetricsTarget, upstream: string) => async (_request: Request, response: Response) => {
      try {
        const upstreamResponse = await request(upstream, { signal: AbortSignal.timeout(3000) });
        const body = await upstreamResponse.text();
        const contentType = upstreamResponse.headers.get("content-type");
        if (contentType) response.setHeader("content-type", contentType);
        response
          .status(upstreamResponse.status)
          .send(upstreamResponse.ok ? corruptor.transform(target, body) : body);
      } catch (error) {
        logger.warn({ error, upstream }, "metrics upstream unavailable");
        response.status(502).type("text/plain").send("metrics upstream unavailable\n");
      }
    };

  app.get("/metrics/payment-api", proxy("payment-api", targets.paymentApi));
  app.get("/metrics/payment-worker", proxy("payment-worker", targets.paymentWorker));

  return app;
}
