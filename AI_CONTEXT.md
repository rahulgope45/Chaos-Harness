# AI context

Last verified: 2026-10-04

## Product contract

Chaos Harness is a local Docker Compose portfolio project that tests both service
recovery and financial correctness. Keep the managed payment system structurally
separate from the managing MAPE-K controller. PostgreSQL is the source of truth;
Redis is an optional fast path. Never claim measured results without a run artifact
and run ID.

## Feature status

| Feature                      | Status      | Evidence                                             |
| ---------------------------- | ----------- | ---------------------------------------------------- |
| Workspace/tooling            | Complete    | lint, format, typecheck, and 2 config tests pass     |
| Local infrastructure         | Complete    | PostgreSQL, Redis, Prometheus, and Toxiproxy healthy |
| Database invariants          | Complete    | 3 live PostgreSQL rejection tests pass               |
| Payment API                  | Complete    | 5 live integration tests, race and Redis fallback    |
| Queue, worker, sink          | Not started | Next feature                                         |
| Observability/load generator | Not started | —                                                    |
| Invariant checker I1–I6      | Not started | —                                                    |
| Runner and safety layer      | Not started | —                                                    |
| Fault injectors/controller   | Not started | —                                                    |
| Evidence runs and fixes      | Not started | —                                                    |

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
- Genuine candidate defects are commit-before-enqueue event loss and worker
  crash-after-side-effect duplicate processing.
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

## Next implementation

Build the BullMQ webhook queue, payment worker, and webhook sink. Preserve the
intentional v1 commit-before-enqueue design so a later real FS-1 experiment can test
the lost-event hypothesis. Add bounded retries, dead-letter handling, configurable sink
failure/latency, and graceful worker shutdown.
