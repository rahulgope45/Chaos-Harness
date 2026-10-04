import express, { type Request, type Response } from "express";
import pino, { type Logger } from "pino";
import { pinoHttp } from "pino-http";

export interface MetricsTargets {
  paymentApi: string;
  paymentWorker: string;
}

interface MetricsProxyDependencies {
  targets: MetricsTargets;
  request?: typeof fetch;
  logger?: Logger;
}

export function createMetricsProxyApp({
  targets,
  request = fetch,
  logger = pino({ level: "info" })
}: MetricsProxyDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  const proxy = (upstream: string) => async (_request: Request, response: Response) => {
    try {
      const upstreamResponse = await request(upstream, { signal: AbortSignal.timeout(3000) });
      const body = await upstreamResponse.text();
      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) response.setHeader("content-type", contentType);
      response.status(upstreamResponse.status).send(body);
    } catch (error) {
      logger.warn({ error, upstream }, "metrics upstream unavailable");
      response.status(502).type("text/plain").send("metrics upstream unavailable\n");
    }
  };

  app.get("/metrics/payment-api", proxy(targets.paymentApi));
  app.get("/metrics/payment-worker", proxy(targets.paymentWorker));

  return app;
}
