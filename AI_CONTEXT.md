# AI context

Last verified: 2026-10-04

## Product contract

Chaos Harness is a local Docker Compose portfolio project that tests both service
recovery and financial correctness. Keep the managed payment system structurally
separate from the managing MAPE-K controller. PostgreSQL is the source of truth;
Redis is an optional fast path. Never claim measured results without a run artifact
and run ID.

## Feature status

| Feature                    | Status      | Evidence                                             |
| -------------------------- | ----------- | ---------------------------------------------------- |
| Workspace/tooling          | Complete    | lint, format, typecheck, and 2 config tests pass     |
| Local infrastructure       | Complete    | PostgreSQL, Redis, Prometheus, and Toxiproxy healthy |
| Database invariants        | Complete    | 3 live PostgreSQL rejection tests pass               |
| Payment API                | Complete    | 5 live integration tests, race and Redis fallback    |
| Queue, worker, sink        | Complete    | 2 live tests plus healthy container end-to-end run   |
| Observability              | Complete    | live metrics, both Prometheus targets up, rules load |
| Load generator             | Complete    | 5 runs, 228/228 successful, journals preserved       |
| Invariant checker I1–I6    | Complete    | live I1–I6 pass plus 6 synthetic corruption proofs   |
| Experiment runner          | Complete    | A/A control report with I1–I6 passing                |
| Safety layer               | Complete    | refusal/abort tests, live dry-run, safe control      |
| FS-1 injector              | Complete    | worker pass plus API event-loss finding F-001        |
| Other injectors/controller | Not started | —                                                    |
| Evidence runs and fixes    | Not started | —                                                    |

## Verified local environment

- Node.js 24.19.0 and npm 12.0.2.
- Docker Desktop Linux engine 28.5.1 and Compose 2.40.3.
- PostgreSQL: `127.0.0.1:5432`.
- Redis: `127.0.0.1:6380`; port 6379 belongs to an unrelated local project.
- Prometheus: `127.0.0.1:19090`; ports 9090 and 9091 are already occupied locally.
- Toxiproxy API: `127.0.0.1:8474`.

## Known dependency issue

`npm audit` currently reports four high-severity transitive advisories through the
Prisma 7.10.0 CLI toolchain (`@prisma/config`, `deepmerge-ts`, and `mysql2`). npm's only
offered forced fix downgrades Prisma to 6.19.3, which conflicts with the required Prisma
7 adapter architecture. Recheck when a patched Prisma 7 release is available; do not
silently force the downgrade.

## Accepted decisions

- Only local containers labeled `chaos-target=true` may be attacked.
- I6 duplicate delivery is report-only after a real injected fault and fails a
  no-fault control run. I1 and I2 always fail on duplicate financial effects.
- Genuine finding F-001 confirms commit-before-enqueue event loss under API SIGKILL.
  Worker crash-after-side-effect duplicate processing remains a candidate.
- Deliberately corrupted data is labeled synthetic and never reported as a genuine
  discovered defect.
- No LICENSE is required yet.

## Database layer

`packages/database` uses Prisma 7.10.0 with `@prisma/adapter-pg`. The initial migration
adds positive-amount checks, an append-only ledger trigger, and a deferred balance
constraint trigger. Run live checks with:

```powershell
$env:DATABASE_URL='postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness'
npm run test:integration
```

## Payment API

`services/payment-api` provides POST `/payments`, GET `/payments/:id`, `/healthz`, and
`/readyz`. It validates input, treats PostgreSQL as authoritative, uses Redis only for
cache/short in-flight locking, handles the unique-key race, writes payment plus balanced
ledger entries in one transaction, logs structured requests, and handles graceful
shutdown.

## Queue, worker, and sink

The API enqueues `payment-created` only after its database transaction commits. This is
the intentional ADR-0003 failure window. BullMQ attempts delivery three times with
exponential backoff. The worker posts to the sink, gracefully closes in-flight work,
logs stalled jobs, and copies exhausted events to a dedicated dead-letter queue. The
sink persists every accepted delivery and supports controlled failure and latency.

All seven Compose services are healthy. A real request through `127.0.0.1:3000` was
delivered to the containerized sink on `127.0.0.1:3002`.

## Observability

The API exports request count and duration histogram metrics. The worker exports
completed/failed job counters, job duration, and live queue depth. Prometheus scrapes
both services and loads recording rules for error rate, p95 latency, and throughput.
Live verification returned `up=1` for both targets after controlled payment traffic.

## Baseline load

The load generator precomputes a seeded Poisson open-loop schedule, includes controlled
idempotent replays, retries timeouts and 5xx responses once with the same key, and writes
an append-only JSONL attempt journal plus a summary. Five five-second development runs
(seeds 41–45) scheduled 228 operations; all 228 succeeded. Mean client p95 was 38.2 ms
and mean achieved throughput was 9.451 requests/second. Exact run IDs and artifacts are
listed in `docs/baseline.md`. These short runs verify the measurement pipeline and are
not a long-duration capacity claim.

## Invariant checker

`harness/invariants` evaluates I1–I6 against a selected client journal, live PostgreSQL,
the webhook sink records, and the BullMQ dead-letter queue. It emits typed evidence and
returns non-zero for hard failures. I6 derives its effective fail/report behavior from
whether a fault was actually injected, per ADR-0004. The clean live report for baseline
run `baseline-2026-10-04T03-03-43-143Z-s45-1a2c636b` has all six passing. Synthetic
snapshot corruption proves each invariant fires without presenting those fixtures as
genuine bugs. The first live check also exposed and led to removal of four leaked
database-test fixture rows; this was test contamination, not a service defect.

## Experiment runner

`harness/runner` validates experiment YAML, serializes execution with a lock, and runs
preflight, baseline, inject, observe, guaranteed revert, recovery wait, verify, and
report phases. Non-control faults are refused until safety and injectors exist. Control
run `no-fault-control-2026-10-04T03-24-48-758Z-3b023a1f` completed with 56/56 successful
operations and I1–I6 passing; its complete artifact directory is preserved.

## Safety layer

The runner rejects remote Docker hosts and any container outside the local
`chaos-harness` Compose project or without `chaos-target=true`. Dry-run performs live
resolution with zero mutation. A hard deadline, SIGINT/SIGTERM handling, concurrent
error-rate watcher, cancellable load, and LIFO revert registry cover abort paths. A live
dry-run approved `payment-api`, and safety-wrapped control run
`no-fault-control-2026-10-04T03-33-27-280Z-adf0733d` passed 56/56 operations and I1–I6;
all seven services remained healthy.

## FS-1 and genuine finding F-001

FS-1 implements kill, stop, pause, and restart behind the allowlist and pre-registered
cleanup. Worker-kill run `kill-worker-mid-batch-2026-10-04T03-41-27-310Z-2d81a6eb`
passed 394/394 operations and I1–I6. API-kill run
`kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` failed I5: four payments
committed during timed-out requests had no sink delivery or DLQ record after 45 seconds.
This confirms the ADR-0003 commit-before-enqueue window as genuine finding F-001. Both
services were automatically restored healthy. The planned fix is a transactional outbox
with before/after replay evidence.

## Next implementation

Commit FS-1 and F-001, then pursue the second genuine candidate: duplicate processing
when a worker dies after the webhook side effect but before BullMQ completion. Keep any
deterministic failpoint labeled synthetic unless the behavior reproduces without it.
