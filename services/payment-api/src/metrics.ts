import type { NextFunction, Request, Response } from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export function createApiMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "payment_api_" });
  const requests = new Counter({
    name: "payment_api_http_requests_total",
    help: "HTTP requests handled by the payment API",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [registry]
  });
  const duration = new Histogram({
    name: "payment_api_http_request_duration_seconds",
    help: "Payment API request duration in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry]
  });

  function middleware(request: Request, response: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    response.on("finish", () => {
      const route = request.route?.path ? String(request.route.path) : "unmatched";
      const labels = {
        method: request.method,
        route,
        status_code: String(response.statusCode)
      };
      requests.inc(labels);
      duration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
    });
    next();
  }

  return { registry, middleware };
}
