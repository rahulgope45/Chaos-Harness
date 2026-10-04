# Invariant checker

The checker evaluates one client journal against live PostgreSQL and BullMQ state. It
returns typed records shaped as `{ invariant, status, violations, evidence }` and exits
non-zero when any hard invariant fails.

| ID  | Contract                                                                                          | Scope                                 |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------- |
| I1  | At most one payment per idempotency key; every successful response for a key names one payment ID | Global database plus selected journal |
| I2  | Debits equal credits per payment and globally                                                     | Global database                       |
| I3  | Every payment acknowledged with 2xx still exists                                                  | Selected journal                      |
| I4  | No payment lacks ledger entries and no ledger entry lacks a payment                               | Global database                       |
| I5  | Every acknowledged payment is delivered or dead-lettered after a bounded drain                    | Selected journal plus sink and DLQ    |
| I6  | Duplicate delivery event IDs are counted                                                          | Selected journal's payments           |

I6 follows ADR-0004: duplicates fail no-fault controls, but default to `report` after an
actually injected fault. Setting `INVARIANT_I6_POLICY=fail` makes fault runs stricter.

Run against a preserved journal from the repository root:

```powershell
$env:INVARIANT_JOURNAL='docs/results/baseline/<run-id>/journal.jsonl'
$env:INVARIANT_OUTPUT='docs/results/invariants/<run-id>.json'
npm run start --workspace @chaos/invariants
```

## Verification evidence

The clean live report in `docs/results/invariants/baseline-s45-clean.json` records all
six invariants passing against baseline run
`baseline-2026-10-04T03-03-43-143Z-s45-1a2c636b` (52 successful journal entries and
49 unique acknowledged payments).

The first live check correctly detected four ledger-less rows left behind by the
duplicate-key integration test. Their `duplicate-*` keys proved they were test-fixture
contamination, not a genuine service defect. The report is preserved as
`baseline-s45-contaminated-fixtures.json`; the integration test now rolls its
transaction back and the four exact leaked fixture rows were removed.

The unit suite separately corrupts an explicitly synthetic in-memory snapshot for each
of I1–I6 and proves the corresponding check fires. These planted cases validate the
tester and are never presented as genuine findings.
