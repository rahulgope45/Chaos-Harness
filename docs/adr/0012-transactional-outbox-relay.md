# ADR-0012: Transactional outbox with a separate relay

- Status: accepted
- Date: 2026-10-05
- Supersedes: ADR-0003

## Context

F-001 proved that committing a payment in PostgreSQL and then adding its webhook job to
Redis creates a crash window. The two writes cannot share a transaction. The fix must
preserve a durable publication intent whenever a payment commits without making Redis a
financial source of truth.

## Decision

Create exactly one `webhook_outbox` row in the same PostgreSQL transaction as each new
payment and its balanced ledger entries. A separate `outbox-relay` service polls pending
rows in creation order, publishes each webhook job to BullMQ, and marks the row
published only after the queue accepts it.

Use the outbox event UUID as the BullMQ job ID. If the relay crashes after queue
publication but before the database update, it retries the same job identity rather
than creating an independent job. Publication failures increment an attempt counter and
retain the last error while leaving the row pending.

Do not backfill historical payments. A backfill would emit old webhooks and blur the
boundary between preserved before-fix evidence and new behavior.

## Alternatives considered

- Keep enqueueing in the API and retry on request replay: rejected because unacknowledged
  committed requests may never be retried.
- Make the payment worker poll payments directly: rejected because it mixes event
  publication with delivery work and requires an inferred "not yet enqueued" state.
- Embed the relay loop in the API: rejected because API restarts would also stop the
  recovery mechanism and couple request-serving lifecycle to background publication.

## Consequences

- A committed new payment always has durable publication intent in PostgreSQL.
- Redis outages delay publication without rolling back or losing payments.
- Delivery remains at-least-once. Consumers must still be idempotent, and I6 remains a
  transport-level duplicate policy rather than a financial correctness check.
- The local stack gains a ninth Compose service and the runner requires its readiness.
- Operational diagnosis must include pending outbox count, publish attempts, relay logs,
  BullMQ state, and sink/DLQ terminal records.

## Verification

The unchanged seed-301 API-kill reproducer passed I1-I6 after this decision in run
`kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`. Its run-window evidence shows
201 committed payments, 201 outbox rows, and 201 published rows.
