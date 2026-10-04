# ADR-0004: Duplicate webhook delivery policy

- Status: accepted
- Date: 2026-10-04

## Context

BullMQ provides at-least-once delivery. A worker can complete a webhook side
effect and crash before acknowledging the job, after which the stalled job may
be delivered again. A repeated delivery is therefore not always a defect.

## Decision

Invariant I6 reports duplicate webhook deliveries during experiments where a
fault was injected. It fails a no-fault control run because an unexplained
duplicate indicates double-enqueue, retry, configuration, or harness behavior
that must be investigated.

The runner derives this behavior from whether it actually injected a fault; the
experiment author does not need to remember to change the policy. An explicit
I6 policy may make reporting stricter, but may not weaken the no-fault rule.

I6 concerns transport delivery only. I1 (payment idempotency) and I2 (ledger
balance) are hard failures in every run, so duplicate delivery must never create
duplicate financial effects.

## Consequences

Reports distinguish expected at-least-once behavior from unexplained duplicates
without hiding financial correctness failures.
