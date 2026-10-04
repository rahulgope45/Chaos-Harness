import type {
  CheckContext,
  InvariantId,
  InvariantResult,
  InvariantSource,
  Violation
} from "./types.js";
import { successfulJournalEntries } from "./journal.js";

const invariantIds: InvariantId[] = ["I1", "I2", "I3", "I4", "I5", "I6"];

export async function runInvariantChecks(
  source: InvariantSource,
  context: CheckContext
): Promise<InvariantResult[]> {
  const successful = successfulJournalEntries(context.journal);
  const uniquePayments = new Set(successful.flatMap((entry) => entry.payment_id ?? [])).size;
  const evidence = {
    run_id: context.journal[0]?.run_id ?? null,
    journal_entries: context.journal.length,
    successful_entries: successful.length,
    unique_acknowledged_payments: uniquePayments
  };
  const queries: Record<InvariantId, () => Promise<Violation[]>> = {
    I1: () => source.queryI1(context),
    I2: () => source.queryI2(context),
    I3: () => source.queryI3(context),
    I4: () => source.queryI4(context),
    I5: () => source.queryI5(context),
    I6: () => source.queryI6(context)
  };

  const results: InvariantResult[] = [];
  for (const invariant of invariantIds) {
    const violations = await queries[invariant]();
    let status: InvariantResult["status"] = violations.length === 0 ? "pass" : "fail";
    if (
      invariant === "I6" &&
      violations.length > 0 &&
      context.faultInjected &&
      context.duplicatePolicy === "report"
    ) {
      status = "report";
    }
    results.push({
      invariant,
      status,
      violations,
      evidence: {
        ...evidence,
        ...(invariant === "I5" ? { drain_timeout_ms: context.drainTimeoutMs } : {}),
        ...(invariant === "I6"
          ? {
              fault_injected: context.faultInjected,
              configured_policy: context.duplicatePolicy,
              effective_policy:
                !context.faultInjected || context.duplicatePolicy === "fail" ? "fail" : "report"
            }
          : {})
      }
    });
  }
  return results;
}

export function exitCodeFor(results: InvariantResult[]): number {
  return results.some((result) => result.status === "fail") ? 1 : 0;
}
