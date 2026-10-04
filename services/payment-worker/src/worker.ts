import {
  Queue,
  Worker,
  WEBHOOK_DEAD_LETTER_QUEUE,
  WEBHOOK_QUEUE,
  redisConnection,
  type WebhookJob
} from "@chaos/queue";
import type { Logger } from "pino";
import { createWorkerMetrics } from "./metrics.js";

interface WorkerOptions {
  redisUrl: string;
  sinkUrl: string;
  concurrency: number;
  logger: Logger;
  queueName?: string;
  deadLetterQueueName?: string;
}

export function startWebhookWorker(options: WorkerOptions) {
  const connection = redisConnection(options.redisUrl);
  const queueName = options.queueName ?? WEBHOOK_QUEUE;
  const deadLetter = new Queue<WebhookJob>(
    options.deadLetterQueueName ?? WEBHOOK_DEAD_LETTER_QUEUE,
    { connection }
  );
  const sourceQueue = new Queue<WebhookJob>(queueName, { connection });
  const metrics = createWorkerMetrics(sourceQueue);
  const activeSince = new Map<string, bigint>();
  const worker = new Worker<WebhookJob>(
    queueName,
    async (job) => {
      try {
        const response = await fetch(`${options.sinkUrl}/webhooks/payment`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(job.data),
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error(`Webhook sink returned ${response.status}`);
      } catch (error) {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade + 1 >= attempts) {
          await deadLetter.add("webhook-dead-letter", job.data, {
            jobId: job.data.event_id,
            removeOnComplete: false,
            removeOnFail: false
          });
        }
        throw error;
      }
    },
    { connection, concurrency: options.concurrency }
  );
  worker.on("error", (error) => options.logger.error({ err: error }, "worker error"));
  worker.on("stalled", (jobId) => options.logger.warn({ jobId }, "webhook job stalled"));
  worker.on("active", (job) =>
    activeSince.set(job.id ?? job.data.event_id, process.hrtime.bigint())
  );
  worker.on("completed", (job) => {
    metrics.completed.inc();
    const key = job.id ?? job.data.event_id;
    const started = activeSince.get(key);
    if (started) metrics.duration.observe(Number(process.hrtime.bigint() - started) / 1e9);
    activeSince.delete(key);
  });
  worker.on("failed", (job) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) metrics.failed.inc();
  });
  return { worker, deadLetter, sourceQueue, metrics };
}
