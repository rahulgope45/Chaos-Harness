import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSchedule, type ScheduledPayment } from "./schedule.js";

interface LoadOptions {
  baseUrl: string;
  seed: number;
  durationSeconds: number;
  ratePerSecond: number;
  timeoutMs: number;
  outputRoot: string;
}

interface AttemptResult {
  status: number | null;
  paymentId: string | null;
  durationMs: number;
  successful: boolean;
}

export async function runLoad(options: LoadOptions) {
  const runId = `baseline-${new Date().toISOString().replace(/[:.]/g, "-")}-s${options.seed}-${randomUUID().slice(0, 8)}`;
  const runDirectory = join(options.outputRoot, runId);
  await mkdir(runDirectory, { recursive: true });
  const journal = createWriteStream(join(runDirectory, "journal.jsonl"), { flags: "wx" });
  const schedule = createSchedule(
    options.seed,
    options.durationSeconds * 1000,
    options.ratePerSecond
  );
  const runStartedAt = Date.now();

  async function attempt(item: ScheduledPayment, attemptNumber: number): Promise<AttemptResult> {
    const body = JSON.stringify({ amount_minor: item.amountMinor, currency: item.currency });
    const hash = createHash("sha256")
      .update(JSON.stringify([item.amountMinor, item.currency]))
      .digest("hex");
    const startedAt = Date.now();
    let status: number | null = null;
    let paymentId: string | null = null;
    let error: string | null = null;
    try {
      const response = await fetch(`${options.baseUrl}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": item.idempotencyKey },
        body,
        signal: AbortSignal.timeout(options.timeoutMs)
      });
      status = response.status;
      const responseBody = (await response.json()) as { id?: string };
      paymentId = responseBody.id ?? null;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const completedAt = Date.now();
    journal.write(
      `${JSON.stringify({
        run_id: runId,
        key: item.idempotencyKey,
        request_hash: hash,
        replay: item.replay,
        attempt: attemptNumber,
        scheduled_at: new Date(runStartedAt + item.offsetMs).toISOString(),
        started_at: new Date(startedAt).toISOString(),
        completed_at: new Date(completedAt).toISOString(),
        status,
        payment_id: paymentId,
        error
      })}\n`
    );
    return {
      status,
      paymentId,
      durationMs: completedAt - startedAt,
      successful: status !== null && status >= 200 && status < 300
    };
  }

  async function dispatch(item: ScheduledPayment): Promise<AttemptResult> {
    const first = await attempt(item, 1);
    if (first.status === null || first.status >= 500) return attempt(item, 2);
    return first;
  }

  const operations = schedule.map(
    (item) =>
      new Promise<AttemptResult>((resolve) => {
        setTimeout(() => void dispatch(item).then(resolve), item.offsetMs);
      })
  );
  const results = await Promise.all(operations);
  await new Promise<void>((resolve, reject) => {
    journal.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });
  const durations = results.map(({ durationMs }) => durationMs).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
  const elapsedSeconds = (Date.now() - runStartedAt) / 1000;
  const summary = {
    run_id: runId,
    seed: options.seed,
    configured_duration_seconds: options.durationSeconds,
    configured_rate_per_second: options.ratePerSecond,
    scheduled_operations: schedule.length,
    successful_operations: results.filter(({ successful }) => successful).length,
    failed_operations: results.filter(({ successful }) => !successful).length,
    replay_operations: schedule.filter(({ replay }) => replay).length,
    client_p95_ms: durations[p95Index] ?? 0,
    achieved_throughput_per_second: results.length / elapsedSeconds,
    elapsed_seconds: elapsedSeconds
  };
  await writeFile(join(runDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, {
    flag: "wx"
  });
  return summary;
}
