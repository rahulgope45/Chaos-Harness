import { z } from "zod";

export const DEFAULT_MONITORED_JOBS = ["payment-api", "payment-worker"] as const;

const prometheusResponseSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    result: z.array(
      z.object({
        metric: z.object({ job: z.string() }),
        value: z.tuple([z.number(), z.string()])
      })
    )
  })
});

interface TelemetrySnapshotBase {
  missingJobs: string[];
  monitoredJobs: string[];
  observedAtMs: number;
}

export type TelemetrySnapshot =
  | (TelemetrySnapshotBase & { available: true; reason: "available" })
  | (TelemetrySnapshotBase & {
      available: false;
      reason: "missing_or_down_targets" | "prometheus_unavailable";
    });

export interface TelemetryMonitor {
  observe(): Promise<TelemetrySnapshot>;
}

export class PrometheusTelemetryMonitor implements TelemetryMonitor {
  constructor(
    private readonly prometheusUrl: string,
    private readonly request: typeof fetch = fetch,
    private readonly jobs: readonly string[] = DEFAULT_MONITORED_JOBS
  ) {}

  async observe(): Promise<TelemetrySnapshot> {
    const observedAtMs = Date.now();
    const monitoredJobs = [...this.jobs];
    try {
      const url = new URL("/api/v1/query", this.prometheusUrl);
      url.searchParams.set(
        "query",
        `up{job=~"${monitoredJobs.join("|")}",instance="metrics-proxy:3003"}`
      );
      const response = await this.request(url, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`Prometheus returned ${response.status}`);
      const body = prometheusResponseSchema.parse(await response.json());
      const values = new Map(body.data.result.map(({ metric, value }) => [metric.job, value[1]]));
      const missingJobs = monitoredJobs.filter((job) => values.get(job) !== "1");
      if (missingJobs.length === 0) {
        return {
          available: true,
          missingJobs,
          monitoredJobs,
          observedAtMs,
          reason: "available"
        };
      }
      return {
        available: false,
        missingJobs,
        monitoredJobs,
        observedAtMs,
        reason: "missing_or_down_targets"
      };
    } catch {
      return {
        available: false,
        missingJobs: monitoredJobs,
        monitoredJobs,
        observedAtMs,
        reason: "prometheus_unavailable"
      };
    }
  }
}
