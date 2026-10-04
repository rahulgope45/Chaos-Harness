import type { ConnectionOptions } from "bullmq";

export { Queue, Worker } from "bullmq";
export type { Job } from "bullmq";

export const WEBHOOK_QUEUE = "payment-webhooks";
export const WEBHOOK_DEAD_LETTER_QUEUE = "payment-webhooks-dead-letter";

export interface WebhookJob {
  event_id: string;
  payment_id: string;
  occurred_at: string;
}

export function redisConnection(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const database = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: database
  };
}
