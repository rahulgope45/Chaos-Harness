import type { Queue, WebhookJob } from "@chaos/queue";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export function createWorkerMetrics(queue: Queue<WebhookJob>) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "payment_worker_" });
  const completed = new Counter({
    name: "payment_worker_jobs_completed_total",
    help: "Webhook jobs completed",
    registers: [registry]
  });
  const failed = new Counter({
    name: "payment_worker_jobs_failed_total",
    help: "Webhook job attempts exhausted",
    registers: [registry]
  });
  const duration = new Histogram({
    name: "payment_worker_job_duration_seconds",
    help: "Webhook job processing duration",
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry]
  });
  const queueDepth = new Gauge({
    name: "payment_worker_queue_depth",
    help: "Waiting and delayed webhook jobs",
    async collect() {
      const counts = await queue.getJobCounts("waiting", "delayed");
      this.set((counts.waiting ?? 0) + (counts.delayed ?? 0));
    },
    registers: [registry]
  });
  return { registry, completed, failed, duration, queueDepth };
}
