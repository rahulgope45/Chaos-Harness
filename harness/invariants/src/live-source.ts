import { createPrismaClient, type DatabaseClient } from "@chaos/database";
import { Queue, WEBHOOK_DEAD_LETTER_QUEUE, redisConnection, type WebhookJob } from "@chaos/queue";
import { successfulJournalEntries } from "./journal.js";
import type { CheckContext, InvariantSource, JournalEntry, Violation } from "./types.js";

function acknowledgedPaymentIds(journal: JournalEntry[]): string[] {
  return [...new Set(successfulJournalEntries(journal).flatMap((entry) => entry.payment_id ?? []))];
}

export class LiveInvariantSource implements InvariantSource {
  private readonly database: DatabaseClient;
  private readonly deadLetter: Queue<WebhookJob>;

  constructor(databaseUrl: string, redisUrl: string) {
    this.database = createPrismaClient(databaseUrl);
    this.deadLetter = new Queue<WebhookJob>(WEBHOOK_DEAD_LETTER_QUEUE, {
      connection: redisConnection(redisUrl)
    });
  }

  private async committedPaymentIds(context: CheckContext): Promise<string[]> {
    const acknowledged = acknowledgedPaymentIds(context.journal);
    const starts = context.journal.flatMap((entry) =>
      entry.started_at ? [new Date(entry.started_at)] : []
    );
    const completions = context.journal.flatMap((entry) =>
      entry.completed_at ? [new Date(entry.completed_at)] : []
    );
    if (starts.length === 0 || completions.length === 0) return acknowledged;
    const startedAt = new Date(Math.min(...starts.map((date) => date.getTime())));
    const completedAt = new Date(Math.max(...completions.map((date) => date.getTime())));
    const committed = await this.database.payment.findMany({
      where: { createdAt: { gte: startedAt, lte: completedAt } },
      select: { id: true }
    });
    return [...new Set([...acknowledged, ...committed.map(({ id }) => id)])];
  }

  async queryI1(context: CheckContext): Promise<Violation[]> {
    const duplicateRows = await this.database.$queryRaw<
      Array<{ idempotency_key: string; count: bigint }>
    >`
      SELECT idempotency_key, COUNT(*)::bigint AS count
      FROM payments
      GROUP BY idempotency_key
      HAVING COUNT(*) > 1
    `;
    const paymentIdsByKey = new Map<string, Set<string>>();
    for (const entry of successfulJournalEntries(context.journal)) {
      if (!entry.payment_id) continue;
      const ids = paymentIdsByKey.get(entry.key) ?? new Set<string>();
      ids.add(entry.payment_id);
      paymentIdsByKey.set(entry.key, ids);
    }
    const journalViolations = [...paymentIdsByKey]
      .filter(([, ids]) => ids.size > 1)
      .map(([idempotency_key, ids]) => ({
        source: "journal",
        idempotency_key,
        payment_ids: [...ids]
      }));
    return [
      ...duplicateRows.map((row) => ({
        source: "database",
        idempotency_key: row.idempotency_key,
        count: Number(row.count)
      })),
      ...journalViolations
    ];
  }

  async queryI2(): Promise<Violation[]> {
    const rows = await this.database.$queryRaw<
      Array<{ scope: string; payment_id: string | null; debit: string; credit: string }>
    >`
      WITH per_payment AS (
        SELECT payment_id,
          COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0) AS debit,
          COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0) AS credit
        FROM ledger_entries
        GROUP BY payment_id
      ), violations AS (
        SELECT 'payment'::text AS scope, payment_id, debit, credit
        FROM per_payment WHERE debit <> credit
        UNION ALL
        SELECT 'global'::text, NULL::uuid, COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        FROM per_payment
        HAVING COALESCE(SUM(debit), 0) <> COALESCE(SUM(credit), 0)
      )
      SELECT scope, payment_id, debit::text, credit::text FROM violations
    `;
    return rows;
  }

  async queryI3(context: CheckContext): Promise<Violation[]> {
    const acknowledged = acknowledgedPaymentIds(context.journal);
    if (acknowledged.length === 0) return [];
    const found = await this.database.payment.findMany({
      where: { id: { in: acknowledged } },
      select: { id: true }
    });
    const foundIds = new Set(found.map(({ id }) => id));
    return acknowledged
      .filter((payment_id) => !foundIds.has(payment_id))
      .map((payment_id) => ({ payment_id, source: "successful_journal_entry" }));
  }

  async queryI4(): Promise<Violation[]> {
    return this.database.$queryRaw<Violation[]>`
      SELECT 'payment_without_ledger'::text AS kind, p.id::text AS payment_id
      FROM payments p
      LEFT JOIN ledger_entries l ON l.payment_id = p.id
      GROUP BY p.id
      HAVING COUNT(l.id) = 0
      UNION ALL
      SELECT 'ledger_without_payment'::text, l.payment_id::text
      FROM ledger_entries l
      LEFT JOIN payments p ON p.id = l.payment_id
      WHERE p.id IS NULL
    `;
  }

  async queryI5(context: CheckContext): Promise<Violation[]> {
    const paymentIds = await this.committedPaymentIds(context);
    if (paymentIds.length === 0) return [];
    const deadline = Date.now() + context.drainTimeoutMs;
    let missing = paymentIds;
    let polling = true;
    while (polling) {
      const deliveries = await this.database.webhookDelivery.findMany({
        where: { paymentId: { in: paymentIds } },
        select: { paymentId: true }
      });
      const terminal = new Set(deliveries.map(({ paymentId }) => paymentId));
      const deadJobs = await this.deadLetter.getJobs([
        "waiting",
        "active",
        "delayed",
        "completed",
        "failed"
      ]);
      for (const job of deadJobs) terminal.add(job.data.payment_id);
      missing = paymentIds.filter((paymentId) => !terminal.has(paymentId));
      if (missing.length === 0) return [];
      polling = Date.now() < deadline;
      if (polling) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(100, context.drainTimeoutMs)));
      }
    }
    return missing.map((payment_id) => ({
      payment_id,
      delivered: false,
      dead_lettered: false
    }));
  }

  async queryI6(context: CheckContext): Promise<Violation[]> {
    const paymentIds = await this.committedPaymentIds(context);
    if (paymentIds.length === 0) return [];
    const deadline = Date.now() + context.duplicateObservationMs;
    while (true) {
      const deliveries = await this.database.webhookDelivery.findMany({
        where: { paymentId: { in: paymentIds } },
        select: { eventId: true, paymentId: true }
      });
      const counts = new Map<string, { payment_id: string; count: number }>();
      for (const delivery of deliveries) {
        const current = counts.get(delivery.eventId);
        counts.set(delivery.eventId, {
          payment_id: delivery.paymentId,
          count: (current?.count ?? 0) + 1
        });
      }
      const duplicates = [...counts]
        .filter(([, value]) => value.count > 1)
        .map(([event_id, value]) => ({ event_id, ...value }));
      if (duplicates.length > 0 || Date.now() >= deadline) return duplicates;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(250, context.duplicateObservationMs))
      );
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.deadLetter.close(), this.database.$disconnect()]);
  }
}
