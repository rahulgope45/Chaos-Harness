# S-001: non-idempotent webhook consumer duplicates a side effect

- Classification: synthetic/fabricated scenario
- Genuine finding: no
- Purpose: prove the harness narrative distinguishes duplicate transport from duplicate
  downstream effects
- Evidence: `docs/results/synthetic/S-001-non-idempotent-consumer.json`

## Planted vulnerable design

The fixture models a webhook consumer that sends a receipt email every time `handle` is
called. It deliberately stores no processed `event_id` and therefore has no idempotency
guard. Delivering the same event twice produces two email side effects.

This is realistic because at-least-once queues can redeliver after a worker crashes
between the external side effect and job acknowledgement. The vulnerability itself is
intentionally authored for demonstration; it was not discovered in the sample payment
service and must never be listed beside genuine findings F-001 or F-002.

## Expected remediation

Persist an inbox/deduplication record keyed by `event_id` in the same transaction as the
consumer's local state change. For external effects such as email, record a durable
send intent and dispatch it idempotently. A process-local set would not survive restart
and is therefore insufficient.

Run the deterministic fixture with:

```powershell
npm run synthetic:s001 --workspace @chaos/invariants
```
