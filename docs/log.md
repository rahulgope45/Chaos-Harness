# Build log

## 2026-10-04 — Foundation infrastructure

- Added pinned local PostgreSQL, Redis, Prometheus, and Toxiproxy services.
- Added local-only port bindings, health checks, named volumes, and a dedicated
  network.
- Added the initial CI quality job and architecture decision records.
- Next: implement and verify PostgreSQL invariants through Prisma migrations.

## 2026-10-04 — Database invariants

- Added a Prisma 7 database package and generated client using the PostgreSQL driver
  adapter.
- Added positive amount checks, an append-only ledger trigger, and a deferred balance
  constraint trigger in the hand-edited migration.
- Proved PostgreSQL rejects an unbalanced commit, ledger update, and duplicate
  idempotency key with three live integration tests.
- Next: implement the payment API and its idempotency race tests.

## 2026-10-04 — Payment API

- Added POST `/payments`, GET `/payments/:id`, liveness, and dependency readiness
  endpoints.
- Added PostgreSQL-authoritative idempotency with Redis caching/in-flight locking and
  correct fallback when Redis is unavailable.
- Added transactional balanced ledger writes, structured request logs, and graceful
  shutdown.
- Proved replay, mismatch, a 50-way same-key race, lookup, and Redis fallback with five
  live integration tests.
- Next: add the BullMQ worker, webhook sink, retries, and dead-letter path.
