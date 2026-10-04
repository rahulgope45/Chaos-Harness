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

## 2026-10-04 — Queue, worker, and webhook sink

- Added enqueue-after-commit webhook jobs and documented the intentional crash window
  in ADR-0003.
- Added a separate worker with bounded exponential retries, stalled-job logging,
  graceful shutdown, and a dedicated dead-letter queue.
- Added a configurable webhook sink that persists each accepted delivery.
- Proved happy-path delivery and exhausted-retry dead lettering with two live tests.
- Built and started separate API, worker, and sink containers; all seven Compose
  services are healthy and a real containerized payment reached the sink.
- Next: add metrics, Prometheus rules, and the reproducible load generator.

## 2026-10-04 — Observability

- Added API request-count and request-duration RED metrics.
- Added worker completed/failed counters, processing duration, and queue-depth gauge.
- Added `/metrics` endpoints, Prometheus scrape targets, and recording rules for error
  rate, p95 latency, and throughput.
- Generated controlled traffic and verified both Prometheus targets report `up=1` and
  the recording-rule group loads successfully.
- Next: implement the seeded open-loop load generator and client journal.

## 2026-10-04 — Reproducible baseline load

- Added a seeded Poisson open-loop load generator with controlled idempotent replays,
  same-key retry behavior, and append-only JSONL attempt journals.
- Preserved five baseline runs and summaries: 228 of 228 operations succeeded, mean
  client p95 was 38.2 ms, and mean achieved throughput was 9.451 requests/second.
- Classified these five-second runs as development evidence rather than a capacity
  claim; longer runs remain required for the final report.
- Corrected the zero-error recording rule so a healthy interval records `0` rather
  than returning no data.
- Next: implement and prove the I1–I6 invariant checker.
