import { describe, expect, it } from "vitest";
import { exitCodeFor, runInvariantChecks } from "./checker.js";
import { successfulJournalEntries } from "./journal.js";
import type { CheckContext, InvariantSource, JournalEntry, Violation } from "./types.js";

interface SyntheticSnapshot {
  payments: Array<{ id: string; key: string }>;
  ledger: Array<{ paymentId: string; direction: "DEBIT" | "CREDIT"; amount: number }>;
  deliveries: Array<{ eventId: string; paymentId: string }>;
  deadLetterPaymentIds: string[];
}

const paymentId = "00000000-0000-4000-8000-000000000001";
const secondPaymentId = "00000000-0000-4000-8000-000000000002";
const baseJournal: JournalEntry[] = [
  {
    run_id: "synthetic-checker-proof",
    key: "synthetic-key",
    request_hash: "synthetic-hash",
    attempt: 1,
    status: 201,
    payment_id: paymentId
  }
];
const context: CheckContext = {
  journal: baseJournal,
  faultInjected: false,
  duplicatePolicy: "report",
  drainTimeoutMs: 0
};

function cleanSnapshot(): SyntheticSnapshot {
  return {
    payments: [{ id: paymentId, key: "synthetic-key" }],
    ledger: [
      { paymentId, direction: "DEBIT", amount: 100 },
      { paymentId, direction: "CREDIT", amount: 100 }
    ],
    deliveries: [{ eventId: "synthetic-event", paymentId }],
    deadLetterPaymentIds: []
  };
}

class SyntheticSnapshotSource implements InvariantSource {
  constructor(private readonly snapshot: SyntheticSnapshot) {}

  async queryI1(checkContext: CheckContext): Promise<Violation[]> {
    const violations: Violation[] = [];
    for (const payment of this.snapshot.payments) {
      const count = this.snapshot.payments.filter(({ key }) => key === payment.key).length;
      if (count > 1 && !violations.some((row) => row.idempotency_key === payment.key)) {
        violations.push({ idempotency_key: payment.key, count });
      }
    }
    const idsByKey = new Map<string, Set<string>>();
    for (const entry of successfulJournalEntries(checkContext.journal)) {
      if (!entry.payment_id) continue;
      const ids = idsByKey.get(entry.key) ?? new Set<string>();
      ids.add(entry.payment_id);
      idsByKey.set(entry.key, ids);
    }
    for (const [key, ids] of idsByKey) {
      if (ids.size > 1) violations.push({ idempotency_key: key, payment_ids: [...ids] });
    }
    return violations;
  }

  async queryI2(): Promise<Violation[]> {
    const paymentIds = new Set(this.snapshot.ledger.map(({ paymentId: id }) => id));
    return [...paymentIds].flatMap((id) => {
      const entries = this.snapshot.ledger.filter(({ paymentId: entryId }) => entryId === id);
      const debit = entries
        .filter(({ direction }) => direction === "DEBIT")
        .reduce((sum, { amount }) => sum + amount, 0);
      const credit = entries
        .filter(({ direction }) => direction === "CREDIT")
        .reduce((sum, { amount }) => sum + amount, 0);
      return debit === credit ? [] : [{ payment_id: id, debit, credit }];
    });
  }

  async queryI3(checkContext: CheckContext): Promise<Violation[]> {
    const existing = new Set(this.snapshot.payments.map(({ id }) => id));
    return [
      ...new Set(
        successfulJournalEntries(checkContext.journal).flatMap((entry) => entry.payment_id ?? [])
      )
    ]
      .filter((id) => !existing.has(id))
      .map((id) => ({ payment_id: id }));
  }

  async queryI4(): Promise<Violation[]> {
    const payments = new Set(this.snapshot.payments.map(({ id }) => id));
    const ledgerPayments = new Set(this.snapshot.ledger.map(({ paymentId: id }) => id));
    return [
      ...this.snapshot.payments
        .filter(({ id }) => !ledgerPayments.has(id))
        .map(({ id }) => ({ kind: "payment_without_ledger", payment_id: id })),
      ...this.snapshot.ledger
        .filter(({ paymentId: id }) => !payments.has(id))
        .map(({ paymentId: id }) => ({ kind: "ledger_without_payment", payment_id: id }))
    ];
  }

  async queryI5(checkContext: CheckContext): Promise<Violation[]> {
    const terminal = new Set([
      ...this.snapshot.deliveries.map(({ paymentId: id }) => id),
      ...this.snapshot.deadLetterPaymentIds
    ]);
    return [
      ...new Set(
        successfulJournalEntries(checkContext.journal).flatMap((entry) => entry.payment_id ?? [])
      )
    ]
      .filter((id) => !terminal.has(id))
      .map((id) => ({ payment_id: id }));
  }

  async queryI6(): Promise<Violation[]> {
    const eventIds = new Set(this.snapshot.deliveries.map(({ eventId }) => eventId));
    return [...eventIds].flatMap((eventId) => {
      const count = this.snapshot.deliveries.filter((row) => row.eventId === eventId).length;
      return count > 1 ? [{ event_id: eventId, count }] : [];
    });
  }

  async close(): Promise<void> {}
}

describe("invariant checker with explicitly synthetic snapshots", () => {
  it("passes all six checks on a clean snapshot", async () => {
    const results = await runInvariantChecks(new SyntheticSnapshotSource(cleanSnapshot()), context);
    expect(results.map(({ status }) => status)).toEqual(Array(6).fill("pass"));
    expect(exitCodeFor(results)).toBe(0);
  });

  const corruptions = {
    I1: (snapshot: SyntheticSnapshot) =>
      snapshot.payments.push({ id: secondPaymentId, key: "synthetic-key" }),
    I2: (snapshot: SyntheticSnapshot) => {
      const credit = snapshot.ledger.find(({ direction }) => direction === "CREDIT");
      if (credit) credit.amount = 99;
    },
    I3: (snapshot: SyntheticSnapshot) => {
      snapshot.payments = [];
    },
    I4: (snapshot: SyntheticSnapshot) =>
      snapshot.payments.push({ id: secondPaymentId, key: "atomicity-fixture" }),
    I5: (snapshot: SyntheticSnapshot) => {
      snapshot.deliveries = [];
    },
    I6: (snapshot: SyntheticSnapshot) =>
      snapshot.deliveries.push({ eventId: "synthetic-event", paymentId })
  } satisfies Record<string, (snapshot: SyntheticSnapshot) => void>;

  for (const [invariant, corrupt] of Object.entries(corruptions)) {
    it(`fires ${invariant} for planted synthetic corruption`, async () => {
      const snapshot = cleanSnapshot();
      corrupt(snapshot);
      const results = await runInvariantChecks(new SyntheticSnapshotSource(snapshot), context);
      expect(results.find((result) => result.invariant === invariant)?.status).toBe("fail");
      expect(exitCodeFor(results)).toBe(1);
    });
  }

  it("reports I6 after an injected fault without weakening no-fault controls", async () => {
    const snapshot = cleanSnapshot();
    corruptions.I6(snapshot);
    const results = await runInvariantChecks(new SyntheticSnapshotSource(snapshot), {
      ...context,
      faultInjected: true
    });
    expect(results.find(({ invariant }) => invariant === "I6")?.status).toBe("report");
    expect(exitCodeFor(results)).toBe(0);
  });
});
