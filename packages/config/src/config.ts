import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PROMETHEUS_URL: z.string().url().default("http://localhost:9090"),
  PAYMENT_API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REDIS_LOCK_TTL_MS: z.coerce.number().int().positive().default(5000),
  WEBHOOK_SINK_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  WEBHOOK_SINK_URL: z.string().url().default("http://localhost:3002"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  METRICS_PROXY_PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  PAYMENT_API_METRICS_URL: z.string().url().default("http://localhost:3000/metrics"),
  PAYMENT_WORKER_METRICS_URL: z.string().url().default("http://localhost:3001/metrics"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}
