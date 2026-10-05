# F-001: committed payments can lose their webhook event

- Status: confirmed, open
- Severity: high in the sample system
- Fault: FS-1 SIGKILL of `payment-api`
- Evidence runs:
  - `kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248`
  - `kill-api-after-commit-2026-10-05T02-35-20-685Z-363c6a04`
  - `kill-api-after-commit-2026-10-05T02-37-15-648Z-ee48b428`
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

`POST /payments` commits the payment and balanced ledger transaction first, then adds a
BullMQ job. SIGKILL can land between those independent operations. PostgreSQL retains
the payment, but Redis never receives an event to process or dead-letter. This is the
failure window documented in ADR-0003 and now demonstrated by a real run.

## Remediation

Write a transactional outbox row in the same PostgreSQL transaction as the payment and
ledger entries. A relay can publish unsent rows to BullMQ and mark them sent
idempotently. Preserve this run as before evidence and repeat it after the fix.

This is a genuine finding. It is separate from synthetic invariant fixtures and the
earlier leaked integration-test rows, neither of which is counted as a product bug.
