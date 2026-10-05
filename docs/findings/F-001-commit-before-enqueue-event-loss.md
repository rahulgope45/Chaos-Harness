# F-001: committed payments can lose their webhook event

- Status: resolved and regression-verified on 2026-10-05
- Severity: high in the sample system
- Fault: FS-1 SIGKILL of `payment-api`
- Evidence runs:
  - Before fix: `kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248`,
    `kill-api-after-commit-2026-10-05T02-35-20-685Z-363c6a04`, and
    `kill-api-after-commit-2026-10-05T02-37-15-648Z-ee48b428`.
  - After fix: `kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`.
- Violated invariant: I5

## Observation

After automatic API restart and a 45-second drain, four payments existed in PostgreSQL
but had neither a webhook delivery nor a dead-letter record:

| Payment ID                             | Idempotency key | Committed at UTC |
| -------------------------------------- | --------------- | ---------------- |
| `266c390c-20e2-4cf0-a3f4-d4451578114a` | `load-301-145`  | 03:43:48.643     |
| `251c3dd3-f4b0-4e84-8695-db2c2c38712f` | `load-301-150`  | 03:43:48.713     |
| `e929346c-8ddb-4254-a8f0-87fc2fe005ae` | `load-301-153`  | 03:43:48.714     |
| `7eaee051-0984-4b70-8e7c-97d672435c6f` | `load-301-154`  | 03:43:48.745     |

PostgreSQL independently returned zero delivery rows for all four. The client journal
shows each original request timed out and its same-key retry failed while the API was
down. The rows were committed even though the clients did not receive acknowledgements.

Day 17 independently reproduced the same I5 failure in two of ten varied-seed,
varied-offset repetitions. Each failing repeat left two committed payments without a
delivery or dead-letter terminal record. The other eight repeats passed, demonstrating
that the crash-window defect is timing-dependent rather than guaranteed on every kill.
These repetitions strengthen this finding; they are not counted as new defects.

## Root cause

Before remediation, `POST /payments` committed the payment and balanced ledger
transaction first, then added a BullMQ job. SIGKILL could land between those independent
operations. PostgreSQL retained the payment, but Redis never received an event to
process or dead-letter. This is the failure window documented in ADR-0003 and
demonstrated by the before-fix runs.

## Remediation implemented

The payment transaction now writes one `webhook_outbox` row alongside the payment and
balanced ledger entries. A separate relay polls unsent rows, uses the outbox event UUID
as the BullMQ job ID, and marks the row published only after `queue.add` succeeds. If the
relay dies after enqueue but before marking the row, the deterministic job ID makes the
retry safe while BullMQ retains that job.

The API no longer publishes directly to Redis, so killing it after PostgreSQL commit
cannot erase the durable intent to publish. Historical payment rows were deliberately
not backfilled because doing so would replay old events and contaminate the preserved
before-fix evidence.

## After-fix verification

The original `experiments/kill-api-after-commit.yml` was rerun unchanged with seed 301
and its two-second injection offset. Run
`kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09` passed I1-I6. I5 checked 192
unique acknowledged payments after its 45-second drain and found no missing delivery or
dead-letter terminal record.

A run-window database query independently counted 201 committed payments, 201 matching
outbox rows, and 201 published rows. That query and its result are preserved in the
run's `outbox-evidence.json`. The original failing artifacts remain untouched as the
before evidence.

This is a genuine finding. It is separate from synthetic invariant fixtures and the
earlier leaked integration-test rows, neither of which is counted as a product bug.
