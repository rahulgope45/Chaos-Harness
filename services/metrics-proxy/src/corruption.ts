export const CORRUPTION_MODES = [
  "none",
  "spike",
  "drop",
  "freeze",
  "noise",
  "counter_reset"
] as const;

export type CorruptionMode = (typeof CORRUPTION_MODES)[number];
export type MetricsTarget = "payment-api" | "payment-worker";

const MONITORED_METRICS = [
  "chaos_metrics_proxy_source_timestamp_seconds",
  "chaos_metrics_proxy_scrapes_total",
  "chaos_metrics_proxy_integrity_value",
  "payment_worker_queue_depth",
  "payment_worker_jobs_completed_total"
] as const;

export function isCorruptionMode(value: unknown): value is CorruptionMode {
  return typeof value === "string" && CORRUPTION_MODES.includes(value as CorruptionMode);
}

function metricName(line: string): string | null {
  return line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+/u)?.[1] ?? null;
}

function replaceMetric(body: string, name: string, value: string): string {
  return body
    .split("\n")
    .map((line) =>
      metricName(line) === name ? line.replace(/\s+\S+(?:\s+\d+)?$/u, ` ${value}`) : line
    )
    .join("\n");
}

function dropMetrics(body: string): string {
  const removed = new Set<string>(MONITORED_METRICS);
  return body
    .split("\n")
    .filter((line) => {
      const name = metricName(line);
      if (name && removed.has(name as (typeof MONITORED_METRICS)[number])) return false;
      const metadataName = line.match(/^# (?:HELP|TYPE) ([a-zA-Z_:][a-zA-Z0-9_:]*)/u)?.[1];
      return !metadataName || !removed.has(metadataName as (typeof MONITORED_METRICS)[number]);
    })
    .join("\n");
}

function appendIntegrityMetrics(
  body: string,
  timestampSeconds: number,
  scrapeCount: number
): string {
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return `${normalized}# HELP chaos_metrics_proxy_source_timestamp_seconds Unix time when the proxy fetched the upstream metrics\n# TYPE chaos_metrics_proxy_source_timestamp_seconds gauge\nchaos_metrics_proxy_source_timestamp_seconds ${timestampSeconds}\n# HELP chaos_metrics_proxy_scrapes_total Upstream metric scrapes completed by the proxy\n# TYPE chaos_metrics_proxy_scrapes_total counter\nchaos_metrics_proxy_scrapes_total ${scrapeCount}\n# HELP chaos_metrics_proxy_integrity_value Fixed canary used to validate the telemetry path\n# TYPE chaos_metrics_proxy_integrity_value gauge\nchaos_metrics_proxy_integrity_value 1\n`;
}

export class MetricsCorruptor {
  private mode: CorruptionMode = "none";
  private readonly scrapeCounts = new Map<MetricsTarget, number>();
  private readonly frozenBodies = new Map<MetricsTarget, string>();

  getMode(): CorruptionMode {
    return this.mode;
  }

  setMode(mode: CorruptionMode): void {
    this.mode = mode;
    this.frozenBodies.clear();
  }

  transform(target: MetricsTarget, body: string, nowMs = Date.now()): string {
    const scrapeCount = (this.scrapeCounts.get(target) ?? 0) + 1;
    this.scrapeCounts.set(target, scrapeCount);
    const enriched = appendIntegrityMetrics(body, nowMs / 1000, scrapeCount);
    if (target !== "payment-worker" || this.mode === "none") return enriched;

    switch (this.mode) {
      case "spike":
        return replaceMetric(
          replaceMetric(enriched, "chaos_metrics_proxy_scrapes_total", "1000000000000000"),
          "payment_worker_queue_depth",
          "1000000000000"
        );
      case "drop":
        return dropMetrics(enriched);
      case "freeze": {
        const frozen = this.frozenBodies.get(target) ?? enriched;
        this.frozenBodies.set(target, frozen);
        return frozen;
      }
      case "noise":
        return replaceMetric(
          replaceMetric(enriched, "chaos_metrics_proxy_integrity_value", "NaN"),
          "payment_worker_queue_depth",
          "NaN"
        );
      case "counter_reset":
        return replaceMetric(
          replaceMetric(enriched, "chaos_metrics_proxy_scrapes_total", "0"),
          "payment_worker_jobs_completed_total",
          "0"
        );
    }
  }
}
