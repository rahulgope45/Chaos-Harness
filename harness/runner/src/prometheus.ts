interface PrometheusResponse {
  status: "success" | "error";
  data?: { result?: Array<{ metric?: Record<string, string>; value?: [number, string] }> };
  error?: string;
}

export interface ScrapeAvailability {
  available: boolean;
  missing_jobs: string[];
  measured_at: string;
}

export interface TelemetryGuardSnapshot {
  valid: boolean;
  issues: string[];
  measured_at: string;
}

const TELEMETRY_GUARD_METRICS = [
  "chaos_metrics_proxy_source_timestamp_seconds",
  "chaos_metrics_proxy_scrapes_total",
  "chaos_metrics_proxy_integrity_value",
  "payment_worker_queue_depth",
  "payment_worker_jobs_completed_total"
] as const;

export interface SteadyStateSnapshot {
  error_rate: number;
  p95_seconds: number | null;
  throughput_per_second: number;
  measured_at: string;
}

async function query(prometheusUrl: string, expression: string): Promise<number | null> {
  const url = new URL("/api/v1/query", prometheusUrl);
  url.searchParams.set("query", expression);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Prometheus returned ${response.status}`);
  const body = (await response.json()) as PrometheusResponse;
  if (body.status !== "success") throw new Error(body.error ?? "Prometheus query failed");
  const raw = body.data?.result?.[0]?.value?.[1];
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function readSteadyState(prometheusUrl: string): Promise<SteadyStateSnapshot> {
  const [errorRate, p95, throughput] = await Promise.all([
    query(prometheusUrl, "payment_api:http_error_rate:ratio5m"),
    query(prometheusUrl, "payment_api:http_request_p95_seconds:5m"),
    query(prometheusUrl, "payment_api:http_throughput:requests_per_second5m")
  ]);
  return {
    error_rate: errorRate ?? 0,
    p95_seconds: p95,
    throughput_per_second: throughput ?? 0,
    measured_at: new Date().toISOString()
  };
}

export async function readScrapeAvailability(
  prometheusUrl: string,
  jobs: readonly string[]
): Promise<ScrapeAvailability> {
  const url = new URL("/api/v1/query", prometheusUrl);
  url.searchParams.set("query", `up{job=~"${jobs.join("|")}",instance="metrics-proxy:3003"}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Prometheus returned ${response.status}`);
  const body = (await response.json()) as PrometheusResponse;
  if (body.status !== "success") throw new Error(body.error ?? "Prometheus query failed");
  const values = new Map(
    (body.data?.result ?? []).flatMap(({ metric, value }) =>
      metric?.job && value ? [[metric.job, value[1]] as const] : []
    )
  );
  const missingJobs = jobs.filter((job) => values.get(job) !== "1");
  return {
    available: missingJobs.length === 0,
    missing_jobs: missingJobs,
    measured_at: new Date().toISOString()
  };
}

export async function readTelemetryGuard(prometheusUrl: string): Promise<TelemetryGuardSnapshot> {
  const url = new URL("/api/v1/query", prometheusUrl);
  url.searchParams.set(
    "query",
    `{__name__=~"${TELEMETRY_GUARD_METRICS.join("|")}",job="payment-worker",instance="metrics-proxy:3003"}`
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Prometheus returned ${response.status}`);
  const body = (await response.json()) as PrometheusResponse;
  if (body.status !== "success") throw new Error(body.error ?? "Prometheus query failed");
  const samples = new Map(
    (body.data?.result ?? []).flatMap(({ metric, value }) =>
      metric?.__name__ && value ? [[metric.__name__, Number(value[1])] as const] : []
    )
  );
  const issues: string[] = [];
  for (const metric of TELEMETRY_GUARD_METRICS) {
    if (!samples.has(metric)) issues.push(`missing:${metric}`);
  }
  for (const [metric, value] of samples) {
    if (!Number.isFinite(value)) issues.push(`non_finite:${metric}`);
  }
  const timestamp = samples.get("chaos_metrics_proxy_source_timestamp_seconds");
  if (timestamp !== undefined && Date.now() - timestamp * 1000 > 15_000) {
    issues.push("stale:chaos_metrics_proxy_source_timestamp_seconds");
  }
  if (samples.get("chaos_metrics_proxy_integrity_value") !== 1) {
    issues.push("invalid:chaos_metrics_proxy_integrity_value");
  }
  const scrapes = samples.get("chaos_metrics_proxy_scrapes_total");
  if (scrapes !== undefined && (scrapes < 0 || scrapes > 1_000_000_000)) {
    issues.push("bounds:chaos_metrics_proxy_scrapes_total");
  }
  const queueDepth = samples.get("payment_worker_queue_depth");
  if (queueDepth !== undefined && (queueDepth < 0 || queueDepth > 1_000_000)) {
    issues.push("bounds:payment_worker_queue_depth");
  }
  return { valid: issues.length === 0, issues, measured_at: new Date().toISOString() };
}
