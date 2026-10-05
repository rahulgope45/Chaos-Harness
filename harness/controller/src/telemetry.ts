import { z } from "zod";

export const DEFAULT_MONITORED_JOBS = ["payment-api", "payment-worker"] as const;
export const DEFAULT_MONITORED_METRICS = [
  "chaos_metrics_proxy_source_timestamp_seconds",
  "chaos_metrics_proxy_scrapes_total",
  "chaos_metrics_proxy_integrity_value",
  "payment_worker_queue_depth",
  "payment_worker_jobs_completed_total"
] as const;

const SOURCE_STALE_AFTER_MS = 15_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const MAX_SCRAPE_COUNTER = 1_000_000_000;
const MAX_QUEUE_DEPTH = 1_000_000;

const prometheusResponseSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    result: z.array(
      z.object({
        metric: z.record(z.string(), z.string()),
        value: z.tuple([z.number(), z.string()])
      })
    )
  })
});

export type TelemetryIssueReason =
  "missing_required_series" | "out_of_bounds" | "stale_sample" | "counter_reset" | "invalid_sample";

export interface TelemetryIssue {
  reason: TelemetryIssueReason;
  metric: string;
}

interface TelemetrySnapshotBase {
  missingJobs: string[];
  monitoredJobs: string[];
  monitoredMetrics: string[];
  observedAtMs: number;
}

export type TelemetrySnapshot =
  | (TelemetrySnapshotBase & {
      available: true;
      valid: true;
      reason: "valid";
      issues: [];
    })
  | (TelemetrySnapshotBase & {
      available: true;
      valid: false;
      reason: "invalid_telemetry";
      issues: TelemetryIssue[];
    })
  | (TelemetrySnapshotBase & {
      available: false;
      valid: false;
      reason: "missing_or_down_targets" | "prometheus_unavailable";
      issues: [];
    });

export interface TelemetryMonitor {
  observe(): Promise<TelemetrySnapshot>;
}

interface PreviousCounter {
  value: number;
  sampleAtMs: number;
}

export class PrometheusTelemetryMonitor implements TelemetryMonitor {
  private previousScrapes: PreviousCounter | null = null;
  private previousCompleted: PreviousCounter | null = null;

  constructor(
    private readonly prometheusUrl: string,
    private readonly request: typeof fetch = fetch,
    private readonly jobs: readonly string[] = DEFAULT_MONITORED_JOBS,
    private readonly metrics: readonly string[] = DEFAULT_MONITORED_METRICS
  ) {}

  private async query(expression: string) {
    const url = new URL("/api/v1/query", this.prometheusUrl);
    url.searchParams.set("query", expression);
    const response = await this.request(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Prometheus returned ${response.status}`);
    return prometheusResponseSchema.parse(await response.json()).data.result;
  }

  async observe(): Promise<TelemetrySnapshot> {
    const observedAtMs = Date.now();
    const monitoredJobs = [...this.jobs];
    const monitoredMetrics = [...this.metrics];
    try {
      const availability = await this.query(
        `up{job=~"${monitoredJobs.join("|")}",instance="metrics-proxy:3003"}`
      );
      const values = new Map(
        availability.flatMap(({ metric, value }) =>
          metric.job ? [[metric.job, value[1]] as const] : []
        )
      );
      const missingJobs = monitoredJobs.filter((job) => values.get(job) !== "1");
      if (missingJobs.length > 0) {
        return {
          available: false,
          valid: false,
          missingJobs,
          monitoredJobs,
          monitoredMetrics,
          observedAtMs,
          reason: "missing_or_down_targets",
          issues: []
        };
      }

      const result = await this.query(
        `{__name__=~"${monitoredMetrics.join("|")}",job="payment-worker",instance="metrics-proxy:3003"}`
      );
      const samples = new Map(
        result.flatMap(({ metric, value }) => {
          const name = metric.__name__;
          return name
            ? [[name, { value: Number(value[1]), sampleAtMs: value[0] * 1000 }] as const]
            : [];
        })
      );
      const issues: TelemetryIssue[] = [];
      for (const metric of monitoredMetrics) {
        if (!samples.has(metric)) issues.push({ reason: "missing_required_series", metric });
      }

      for (const [metric, sample] of samples) {
        if (!Number.isFinite(sample.value)) issues.push({ reason: "invalid_sample", metric });
      }

      const sourceTimestamp = samples.get("chaos_metrics_proxy_source_timestamp_seconds")?.value;
      if (
        sourceTimestamp !== undefined &&
        Number.isFinite(sourceTimestamp) &&
        (observedAtMs - sourceTimestamp * 1000 > SOURCE_STALE_AFTER_MS ||
          sourceTimestamp * 1000 - observedAtMs > MAX_FUTURE_SKEW_MS)
      ) {
        issues.push({
          reason: "stale_sample",
          metric: "chaos_metrics_proxy_source_timestamp_seconds"
        });
      }

      const integrity = samples.get("chaos_metrics_proxy_integrity_value")?.value;
      if (integrity !== undefined && Number.isFinite(integrity) && integrity !== 1) {
        issues.push({ reason: "out_of_bounds", metric: "chaos_metrics_proxy_integrity_value" });
      }
      const scrapes = samples.get("chaos_metrics_proxy_scrapes_total");
      if (
        scrapes &&
        Number.isFinite(scrapes.value) &&
        (scrapes.value < 0 || scrapes.value > MAX_SCRAPE_COUNTER)
      ) {
        issues.push({ reason: "out_of_bounds", metric: "chaos_metrics_proxy_scrapes_total" });
      }
      const queueDepth = samples.get("payment_worker_queue_depth")?.value;
      if (
        queueDepth !== undefined &&
        Number.isFinite(queueDepth) &&
        (queueDepth < 0 || queueDepth > MAX_QUEUE_DEPTH)
      ) {
        issues.push({ reason: "out_of_bounds", metric: "payment_worker_queue_depth" });
      }

      const completed = samples.get("payment_worker_jobs_completed_total");
      if (
        scrapes &&
        Number.isFinite(scrapes.value) &&
        this.previousScrapes &&
        scrapes.sampleAtMs > this.previousScrapes.sampleAtMs &&
        scrapes.value < this.previousScrapes.value
      ) {
        issues.push({ reason: "counter_reset", metric: "chaos_metrics_proxy_scrapes_total" });
      }
      if (
        completed &&
        Number.isFinite(completed.value) &&
        this.previousCompleted &&
        completed.sampleAtMs > this.previousCompleted.sampleAtMs &&
        completed.value < this.previousCompleted.value
      ) {
        issues.push({ reason: "counter_reset", metric: "payment_worker_jobs_completed_total" });
      }

      if (issues.length > 0) {
        return {
          available: true,
          valid: false,
          missingJobs: [],
          monitoredJobs,
          monitoredMetrics,
          observedAtMs,
          reason: "invalid_telemetry",
          issues
        };
      }

      if (scrapes) this.previousScrapes = scrapes;
      if (completed) this.previousCompleted = completed;
      return {
        available: true,
        valid: true,
        missingJobs: [],
        monitoredJobs,
        monitoredMetrics,
        observedAtMs,
        reason: "valid",
        issues: []
      };
    } catch {
      return {
        available: false,
        valid: false,
        missingJobs: monitoredJobs,
        monitoredJobs,
        monitoredMetrics,
        observedAtMs,
        reason: "prometheus_unavailable",
        issues: []
      };
    }
  }
}
