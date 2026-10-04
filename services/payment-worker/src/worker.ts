import {
  Queue,
  Worker,
  WEBHOOK_DEAD_LETTER_QUEUE,
  WEBHOOK_QUEUE,
  redisConnection,
  type WebhookJob
} from "@chaos/queue";
import type { Logger } from "pino";

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
  return { worker, deadLetter };
}
