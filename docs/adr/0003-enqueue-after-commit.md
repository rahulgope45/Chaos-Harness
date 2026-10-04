# ADR-0003: Enqueue webhooks after payment commit in v1

- Status: accepted as an intentional v1 limitation
- Date: 2026-10-04

## Context

The API must persist the payment and balanced ledger atomically, then publish a webhook
job. Making the database transaction and Redis queue enqueue atomic would require an
outbox or another coordination mechanism.

## Decision

Version 1 commits the PostgreSQL transaction before adding the BullMQ job. The API does
not claim atomicity across those systems. This deliberately common naive design leaves
a crash window between commit and enqueue.

The later `kill-api-after-commit` experiment will test the hypothesis that this window
can produce a committed payment with no delivered or dead-lettered event. It is only a
candidate defect until a real run artifact reproduces it.

## Consequences

The initial design stays easy to understand and gives the harness a realistic failure
hypothesis. If confirmed, the planned correction is a transactional outbox plus relay,
followed by the identical experiment and seed to produce before/after evidence.
