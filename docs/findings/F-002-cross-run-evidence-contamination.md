# F-002: repeated seeds contaminated evidence across experiment runs

- Status: confirmed, fixed
- Severity: high for harness credibility
- Component: load generator and I6 verification
- Evidence runs:
  - source run: `kill-worker-after-side-effect-2026-10-04T03-56-55-591Z-4e4c6e17`
  - contaminated run: `kill-worker-after-side-effect-2026-10-04T04-02-27-152Z-5696b0b1`
  - fixed run: `kill-worker-after-side-effect-2026-10-04T04-04-15-336Z-b564632d`

## Observation

The first run created four delayed duplicate webhook deliveries. Its initial I6 check
finished before BullMQ replayed the stalled jobs. A second run with the same seed then
reported those exact four event IDs immediately, before that run could possibly reach
its own stalled-job replay interval.

The load schedule generated keys as `load-<seed>-<index>`. Reusing seed 401 therefore
replayed payments from the earlier experiment instead of creating a run-isolated data
set. Historical webhook rows for those payments could be mistaken for current-run
evidence. The same contamination could create either a false positive or a false pass.

## Root cause

The seed controlled both workload shape and the globally persisted idempotency-key
namespace. Deterministic workload generation is desirable; deterministic database
identity across independent runs is not. I6 also performed a point-in-time query, so a
valid delayed replay could arrive after verification had already completed.

## Fix and proof

The load generator now prefixes keys with its unique run ID while preserving same-key
replays inside that run. I6 has a separately configured duplicate-observation window,
rather than borrowing I5's terminal-delivery drain timeout.

The fixed run created 151 new payments from 153 successful operations. About 60 seconds
after verification began, I6 reported four new duplicate event IDs. I1 and I2 passed,
so the result is correctly classified as expected at-least-once transport behavior,
not duplicate financial processing. A regression test proves identical seeds in two
run namespaces cannot share idempotency keys.

This is a genuine harness defect found through live execution. It is not a planted or
synthetic product finding.
