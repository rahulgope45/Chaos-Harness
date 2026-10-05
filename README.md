# Chaos Harness

A local chaos-engineering harness for testing both recovery behavior and data
correctness in a sample payment system. The managed payment services and the
rule-based MAPE-K controller are kept structurally separate.

## Status

Active development. The managed payment stack, reproducible load generator, I1–I6
checker, no-fault experiment runner, Docker safety boundary, response tracker, and
rule-based controller are implemented. FS-1 covers service outages, FS-2 covers corrupt
telemetry, FS-3 covers metrics sensor loss, and FS-4 provides allowlisted Toxiproxy
network faults. A/A controls pass; only implemented injectors are enabled behind the
safety boundary. Defect claims are added only after reproducible fault runs produce
evidence artifacts and run IDs.

Day 19 replaced the API's commit-then-enqueue dual write with a transactional PostgreSQL
outbox and a separate relay. The unchanged seed-301 API-kill reproducer that originally
failed I5 now passes I1-I6 in run
`kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`; all 201 payments committed in
the run window had matching published outbox rows. F-001 is resolved, with both before
and after artifacts preserved.

Day 17 matrix `day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` completed all 130
planned runs: ten repeats of every one of the 13 implemented experiment configurations,
with varied deterministic fault offsets. It produced aggregate JSON and Markdown with
median, nearest-rank p90, min, max, missing timing counts, invariant rates, and all
source run IDs. See `docs/matrix.md`.

Day 18 gap matrix `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6` added ten
peak-load repetitions each for Redis outage, controller restart during a worker outage,
and PostgreSQL latency. All 30 reports and every I1-I6 result passed. All ten controller
restart assessments proved the worker was already down, the replacement controller
started, and a successful recovery action followed. No new defect was found; the genuine
finding count remains two. Direct PostgreSQL-container mutation remains excluded by the
blast-radius decision in ADR-0011.

Controller run `kill-worker-with-controller-2026-10-04T04-38-33-079Z-6548b9dd`
detected a killed worker in 733 ms, selected and verified a restart, completed 281/281
operations, and passed I1–I6. Across the ten Day 17 controller repeats, MTTD was 632 ms
median and 872 ms p90; controller-run MTTR was 8,649 ms median and 9,021 ms p90.

FS-1 is implemented. Before-fix run
`kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` confirmed the first genuine
defect: four committed payments lost their webhook event because database commit and
queue enqueue were not atomic. The Day 19 outbox fix above closes that window. See
`docs/findings/F-001-commit-before-enqueue-event-loss.md`.

The worker crash-after-webhook experiment reported four expected at-least-once transport
duplicates while I1 and I2 remained clean. During that investigation the harness itself
revealed and fixed genuine finding F-002: repeated seeds reused persisted idempotency
keys and could contaminate evidence across runs. See
`docs/findings/F-002-cross-run-evidence-contamination.md`.

FS-4 evidence includes a PostgreSQL latency run that exposed major client-visible
degradation without corrupting acknowledged payments, and a sink-timeout run that
produced expected transport duplicates without duplicate financial effects. See
`docs/fs4.md`.

FS-3 run `sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8` stopped the
metrics proxy. The controller entered blind mode, emitted an alert, used Docker state as
its fallback, and performed no action against the healthy worker. All 214 operations and
I1-I6 passed. See `docs/fs3.md`.

FS-2 runs exercised spike, dropped-series, frozen/stale, non-finite noise, and
counter-reset modes. All five were detected, every worker stayed healthy, every
scheduled operation and I1-I6 passed, and each measured false-action count was zero.
The Day 17 matrix repeated every mode ten times; all 50 assessments passed with zero
controller actions and zero false actions. See `docs/fs2.md` and `docs/matrix.md`.

## Handover

- [Project introduction](docs/handover/00-project-introduction.md)
- [Current startup runbook](docs/handover/01-current-startup-runbook.md)
- [Day-by-day implementation](docs/handover/02-day-by-day-implementation.md)
- [Study guide and debugging map](docs/handover/03-study-guide.md)

One intentionally fabricated case is kept separately as synthetic scenario S-001. It
models a non-idempotent webhook consumer duplicating an email side effect and is never
presented as a discovered defect. See
`docs/synthetic/S-001-non-idempotent-webhook-consumer.md`.

## Local infrastructure

1. Copy `.env.example` to `.env` if you need to override the safe local defaults.
2. Run `docker compose up -d`.
3. Run `docker compose ps` and confirm every service is healthy.
4. Open Prometheus at <http://127.0.0.1:19090>.

All published ports bind to `127.0.0.1`. Only containers labeled
`chaos-target=true` may be attacked by the experiment runner.

## Quality checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
```

## Scope

Version 1 targets Docker Compose on the local machine. It does not claim
production readiness, Kubernetes support, true packet-loss injection, or safe
operation against remote Docker hosts.
