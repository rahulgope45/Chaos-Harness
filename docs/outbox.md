# Transactional webhook outbox

F-001 demonstrated that a PostgreSQL commit followed by a Redis enqueue can lose a
webhook event when the API is killed between those operations. The current design makes
the publication intent part of the payment transaction.

## Write path

For a new idempotency key, one PostgreSQL transaction creates:

1. the payment;
2. its balanced ledger entries; and
3. one `webhook_outbox` row with a stable event UUID.

An idempotent replay returns the existing payment and creates no second outbox row.
Redis is absent from the transaction and API request path.

## Relay path

`outbox-relay` polls pending rows in `created_at`, `event_id` order. For each row it:

1. maps the durable data to a `payment-created` webhook job;
2. calls BullMQ with `jobId = event_id`;
3. sets `published_at` and clears `last_error` only after successful enqueue; or
4. increments `publish_attempts`, records the error, and leaves the row pending.

The deterministic job ID closes the relay's own enqueue/mark window while the BullMQ job
is retained. It does not change the system's at-least-once delivery contract: a worker
can still redeliver after crashing around a side effect, so consumers remain idempotent.

## Health and configuration

- Health: `http://127.0.0.1:3004/healthz`
- Readiness: `http://127.0.0.1:3004/readyz`
- `OUTBOX_RELAY_PORT` defaults to `3004`.
- `OUTBOX_RELAY_POLL_MS` defaults to `250`.
- `OUTBOX_RELAY_BATCH_SIZE` defaults to `50`.

Readiness requires both PostgreSQL and BullMQ/Redis. The experiment runner and matrix
readiness barrier refuse to start while the relay is unready.

## Diagnosis

Inspect relay logs first:

```powershell
docker compose logs --tail 100 outbox-relay
```

Inspect current row state:

```powershell
docker compose exec -T postgres psql -U chaos -d chaos_harness -c `
  'SELECT event_id, payment_id, created_at, published_at, publish_attempts, last_error FROM webhook_outbox ORDER BY created_at DESC LIMIT 20;'
```

- `published_at IS NULL`, attempts increasing: Redis or queue publication is failing.
- `published_at IS NULL`, attempts unchanged: relay is stopped, unready, or not polling.
- `published_at` set but no sink/DLQ record: inspect BullMQ and the payment worker.
- multiple sink rows for one event: expected transport duplication may have occurred;
  check I6 policy and then verify I1/I2 for duplicate financial effects.

Do not manually mark a row published to clear an alert. Restore the dependency or relay
and let the normal path prove that BullMQ accepted the deterministic job.
