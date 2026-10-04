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
