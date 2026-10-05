import type { DatabaseClient } from "@chaos/database";
import type { WebhookJob } from "@chaos/queue";
import type { Logger } from "pino";

export interface OutboxQueue {
  add(name: string, data: WebhookJob, options: object): Promise<unknown>;
}

interface RelayOptions {
  database: DatabaseClient;
  queue: OutboxQueue;
  logger: Logger;
  batchSize: number;
}

interface RelayLoopOptions extends RelayOptions {
  pollMs: number;
}

export interface PublishBatchResult {
  selected: number;
  published: number;
  failed: number;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2048);
}

export async function publishOutboxBatch(options: RelayOptions): Promise<PublishBatchResult> {
  const pending = await options.database.webhookOutbox.findMany({
    where: { publishedAt: null },
    orderBy: [{ createdAt: "asc" }, { eventId: "asc" }],
    take: options.batchSize
  });
  let published = 0;
  let failed = 0;

  for (const row of pending) {
    const job: WebhookJob = {
      event_id: row.eventId,
      payment_id: row.paymentId,
      occurred_at: row.occurredAt.toISOString()
    };
    try {
      await options.queue.add("payment-created", job, {
        jobId: job.event_id,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: false
      });
      await options.database.webhookOutbox.updateMany({
        where: { eventId: row.eventId, publishedAt: null },
        data: {
          publishedAt: new Date(),
          publishAttempts: { increment: 1 },
          lastError: null
        }
      });
      published += 1;
    } catch (error) {
      failed += 1;
      const message = errorMessage(error);
      await options.database.webhookOutbox.updateMany({
        where: { eventId: row.eventId, publishedAt: null },
        data: { publishAttempts: { increment: 1 }, lastError: message }
      });
      options.logger.warn({ eventId: row.eventId, err: error }, "outbox publish failed");
    }
  }

  return { selected: pending.length, published, failed };
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

export function startOutboxRelay(options: RelayLoopOptions): { stop(): Promise<void> } {
  const stop = new AbortController();
  const loop = (async () => {
    while (!stop.signal.aborted) {
      try {
        const result = await publishOutboxBatch(options);
        if (result.published > 0 || result.failed > 0) {
          options.logger.info(result, "outbox batch processed");
        }
      } catch (error) {
        options.logger.error({ err: error }, "outbox batch failed");
      }
      await delay(options.pollMs, stop.signal);
    }
  })();

  return {
    async stop() {
      stop.abort();
      await loop;
    }
  };
}
