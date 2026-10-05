# Verified resume bullets

Use only the bullets that match the role. Every number below is backed by a checked-in
run or aggregate artifact; do not round them into larger claims.

## Distributed systems / backend

- Built a nine-service TypeScript/PostgreSQL/Redis chaos testbed for an idempotent payment
  workflow, with database-enforced append-only double-entry balance and six post-fault
  correctness invariants.
- Found and reproduced a commit-before-enqueue event-loss defect under API SIGKILL, then
  implemented a transactional outbox and deterministic BullMQ relay; the unchanged
  seed-301 reproducer passed I1-I6 after the fix with 201/201 run-window outbox rows
  published.
- Designed at-least-once webhook handling that distinguishes duplicate transport from
  duplicate financial effects, preserving duplicate evidence without treating expected
  stalled-job replay as data corruption.

## Reliability / chaos engineering

- Implemented four bounded fault classes—service outages, five-mode telemetry corruption,
  sensor loss, and TCP latency/timeout/reset—with local target allowlists, hard deadlines,
  abort thresholds, and guaranteed reverse-order cleanup.
- Built a PostgreSQL-backed rule-based MAPE-K controller with hysteresis, cooldown, restart
  budgets, blind mode, and corrupt-telemetry rejection; ten repeated controller runs
  measured 632 ms median and 872 ms p90 MTTD.
- Orchestrated a reproducible 130-run matrix across 13 scenarios plus a 30-run peak/gap
  matrix, preserving per-run journals, timelines, invariant evidence, and aggregate
  median/p90/min/max statistics with missing samples kept explicit.

## Testing / developer productivity

- Created seeded open-loop load, run-isolated request identities, I1-I6 verification, and
  JSON/Markdown aggregate reporting; diagnosed and fixed cross-run evidence contamination
  caused by deterministic idempotency keys.
- Added GitHub Actions quality, live PostgreSQL/Redis integration, and bounded chaos-smoke
  jobs with artifact upload and cleanup, plus a cross-platform one-command local demo.
- Maintained 94 unit and 10 live integration tests with strict TypeScript, ESLint,
  Prettier, Compose validation, dependency review, and an extension contract for future
  safe fault adapters.

## Evidence references

- Day 17 aggregate: `day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c`
- Day 18 aggregate: `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6`
- F-001 after-fix run: `kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`
- Final local smoke: `ci-smoke-worker-kill-2026-10-05T04-24-22-895Z-9fce2893`
