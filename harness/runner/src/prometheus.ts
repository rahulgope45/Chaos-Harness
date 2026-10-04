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
