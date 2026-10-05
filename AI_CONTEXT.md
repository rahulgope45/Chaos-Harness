# AI context

Last verified: 2026-10-05

## Product contract

Chaos Harness is a local Docker Compose portfolio project that tests both service
recovery and financial correctness. Keep the managed payment system structurally
separate from the managing MAPE-K controller. PostgreSQL is the source of truth;
Redis is an optional fast path. Never claim measured results without a run artifact
and run ID.

Root release version: 1.0.0. Day 1 through Day 21 are complete. The release commit is
tagged locally as `v1.0.0`; do not claim a GitHub release or hosted CI result until the
commit/tag are pushed and GitHub reports them.

## Feature status

| Feature                  | Status   | Evidence                                            |
| ------------------------ | -------- | --------------------------------------------------- |
| Workspace/tooling        | Complete | lint, format, typecheck, 94 unit tests pass         |
| Local infrastructure     | Complete | nine Compose services healthy                       |
| Database invariants      | Complete | 3 live PostgreSQL rejection tests pass              |
| Payment API              | Complete | 5 live integration tests, race and Redis fallback   |
| Outbox, queue, worker    | Complete | relay tests plus healthy container end-to-end run   |
| Observability            | Complete | both app jobs scrape through metrics proxy          |
| Load generator           | Complete | run-isolated keys; all current checks pass          |
| Invariant checker I1–I6  | Complete | delayed I6 replay evidence plus synthetic proofs    |
| Experiment runner        | Complete | A/A control report with I1–I6 passing               |
| Safety layer             | Complete | refusal/abort tests, live dry-run, safe control     |
| FS-1 injector            | Complete | findings F-001 and F-002; delayed duplicate report  |
| Synthetic scenario S-001 | Complete | planted non-idempotent consumer; never a finding    |
| Response tracker         | Complete | live MTTR 6,939 ms; honest null MTTD                |
| MAPE-K controller        | Complete | live MTTD 733 ms; 281/281 and I1–I6 pass            |
| FS-4 network faults      | Complete | two live runs; automatic toxic cleanup              |
| FS-3 sensor disruption   | Complete | blind/restored events; zero controller actions      |
| FS-2 telemetry faults    | Complete | five modes detected; zero false actions             |
| Multi-run aggregation    | Complete | Day 17 130/130 plus Day 18 30/30 gap matrix         |
| Day 18 bug hunt          | Complete | 30/30 added peak scenarios passed I1-I6             |
| Handover documentation   | Complete | intro, startup, day history, and study guide        |
| Finding fix phase        | Complete | F-001/F-002 fixes regression-covered                |
| Day 20 delivery          | Complete | CI integration/smoke, demo, extension/security docs |
| Day 21 release polish    | Complete | final README, recording script, resume bullets, v1  |

## Verified local environment

- Node.js 24.19.0 and npm 12.0.2.
- Docker Desktop Linux engine 28.5.1 and Compose 2.40.3.
- PostgreSQL: `127.0.0.1:5432`.
- Redis: `127.0.0.1:6380`; port 6379 belongs to an unrelated local project.
- Prometheus: `127.0.0.1:19090`; ports 9090 and 9091 are already occupied locally.
- Metrics proxy: `127.0.0.1:3003`.
- Outbox relay: `127.0.0.1:3004`.
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
- Genuine finding F-001 confirmed commit-before-enqueue event loss under API SIGKILL and
  is fixed by ADR-0012's transactional outbox. Genuine finding F-002 confirmed cross-run
  evidence contamination in the harness and is fixed. Worker crash-after-side-effect
  produced expected transport duplicates but no duplicate financial effects.
- Every new payment transaction creates exactly one outbox row. A separate relay uses
  the event UUID as the BullMQ job ID and marks publication only after queue acceptance.
  Historical payments are not backfilled.
- Deliberately corrupted data is labeled synthetic and never reported as a genuine
  discovered defect.
- S-001 is the single requested fabricated scenario: an explicitly planted
  non-idempotent webhook consumer duplicates an email side effect on redelivery.
- MTTD and MTTR come only from explicit response events. Missing controller events are
  `null`; runner phase timestamps are never substituted for detection.
- Controller policies are versioned PostgreSQL rows and are reloaded every cycle.
  Hysteresis, cooldown, and restart-window limits are mandatory policy fields.
- FS-4 is restricted to three static Toxiproxy paths. It supports latency/jitter,
  timeout, and reset-peer toxics; it does not claim true packet loss.
- PostgreSQL remains outside the direct Docker mutation allowlist. Day 18 uses the
  API-to-PostgreSQL proxy so evidence storage and invariant verification survive the
  experiment; see ADR-0011.
- Missing proxy-backed telemetry enters blind mode and emits an alert. No destructive
  action is inferred from absence; Docker state remains the independent fallback.
- Present telemetry is rejected when required series are missing, samples are
  non-finite/out of bounds/stale, or newer counters decrease unexpectedly. FS-2 uses an
  authenticated proxy control endpoint, registers cleanup first, and measures false
  actions only while Docker confirms the worker stayed healthy.
- No LICENSE is required yet.
- CI uses read-only permissions, an ephemeral hosted runner, live integration tests, and
  a bounded FS-1 smoke whose run evidence and Compose diagnostics are uploaded.
- `npm run demo` provisions/migrates/builds the local stack and runs
  `experiments/ci-smoke.yml`; it leaves services running for inspection.
- The example HTTP adapter is compile-tested documentation, not an enabled fault class.

## Database layer

`packages/database` uses Prisma 7.10.0 with `@prisma/adapter-pg`. Migrations add
positive-amount checks, an append-only ledger trigger, a deferred balance constraint
trigger, and the one-to-one `webhook_outbox` table. Run live checks with:

```powershell
$env:DATABASE_URL='postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness'
npm run test:integration
```

## Payment API

`services/payment-api` provides POST `/payments`, GET `/payments/:id`, `/healthz`, and
`/readyz`. It validates input, treats PostgreSQL as authoritative, uses Redis only for
cache/short in-flight locking, handles the unique-key race, writes payment, balanced
ledger entries, and one webhook outbox row in a transaction, logs structured requests,
and handles graceful shutdown.

## Outbox relay, queue, worker, and sink

`services/outbox-relay` polls pending PostgreSQL rows, enqueues `payment-created` with
the outbox event UUID as deterministic BullMQ job ID, and records publish success or
retry error. This replaces ADR-0003's API dual-write per ADR-0012. BullMQ attempts
delivery three times with exponential backoff. The worker posts to the sink, gracefully
closes in-flight work, logs stalled jobs, and copies exhausted events to a dedicated
dead-letter queue. The sink persists every accepted delivery and supports controlled
failure and latency.

All nine Compose services are healthy. A real request through `127.0.0.1:3000` was
delivered to the containerized sink on `127.0.0.1:3002`.

## Observability

The API exports request count and duration histogram metrics. The worker exports
completed/failed job counters, job duration, and live queue depth. Prometheus scrapes
both through `services/metrics-proxy` and loads recording rules for error rate, p95
latency, and throughput. The proxy adds source-time, scrape-counter, and fixed-value
integrity canaries. Live verification returned `up=1` for both proxy-backed jobs.

## Baseline load

The load generator precomputes a seeded Poisson open-loop schedule, includes controlled
idempotent replays, retries timeouts and 5xx responses once with the same key, and writes
an append-only JSONL attempt journal plus a summary. Five five-second development runs
(seeds 41–45) scheduled 228 operations; all 228 succeeded. Mean client p95 was 38.2 ms
and mean achieved throughput was 9.451 requests/second. Exact run IDs and artifacts are
listed in `docs/baseline.md`. These short runs verify the measurement pipeline and are
not a long-duration capacity claim.
Each execution now namespaces idempotency keys by unique run ID. The seed still
reproduces timing, amounts, and replay placement without colliding with persisted rows
from an earlier run.

## Invariant checker

`harness/invariants` evaluates I1–I6 against a selected client journal, live PostgreSQL,
the webhook sink records, and the BullMQ dead-letter queue. It emits typed evidence and
returns non-zero for hard failures. I6 derives its effective fail/report behavior from
whether a fault was actually injected, per ADR-0004, and supports a dedicated delayed
duplicate observation window. The clean live report for baseline
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

For `controller.restart_during_outage`, the runner stops its current controller child,
injects and verifies the worker outage, starts a replacement child using the same run
event stream, and writes `controller-restart-assessment.json`. Passing requires the
fault/restart ordering, an observed worker outage, a successful controller recovery
action, and recovery after restart began.

## Safety layer

The runner rejects remote Docker hosts and any container outside the local
`chaos-harness` Compose project or without `chaos-target=true`. Dry-run performs live
resolution with zero mutation. A hard deadline, SIGINT/SIGTERM handling, concurrent
error-rate watcher, cancellable load, and LIFO revert registry cover abort paths. A live
dry-run approved `payment-api`, and safety-wrapped control run
`no-fault-control-2026-10-04T03-33-27-280Z-adf0733d` passed 56/56 operations and I1–I6;
all seven services remained healthy.

## FS-1 and resolved genuine finding F-001

FS-1 implements kill, stop, pause, and restart behind the allowlist and pre-registered
cleanup. Worker-kill run `kill-worker-mid-batch-2026-10-04T03-41-27-310Z-2d81a6eb`
passed 394/394 operations and I1–I6. API-kill run
`kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` failed I5: four payments
committed during timed-out requests had no sink delivery or DLQ record after 45 seconds.
This confirmed the ADR-0003 commit-before-enqueue window as genuine finding F-001. Day
19 implemented ADR-0012's transactional outbox and relay. The unchanged seed-301,
two-second-injection config then passed I1-I6 in run
`kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`: I5 checked 192 acknowledged
payments, and run-window evidence records 201 payments, 201 matching outbox rows, and
201 published rows. F-001 is resolved; all before artifacts remain preserved.

## Worker crash evidence and genuine finding F-002

Worker crash-after-persistence run
`kill-worker-after-side-effect-2026-10-04T04-04-15-336Z-b564632d` completed 153/153
operations and reported four delayed transport duplicates after stalled-job recovery.
I1 and I2 passed, so this is expected at-least-once behavior rather than a product bug.
The investigation found genuine harness defect F-002: repeated seeds reused persisted
idempotency keys, allowing historical deliveries to contaminate later evidence. Keys are
now unique per run, and I6 observes delayed duplicates independently of I5's drain.

## Response tracker

The runner/controller append validated fault, anomaly, plan, action, telemetry-blind,
telemetry-restored, telemetry-invalid, telemetry-validated, and recovery events to a
per-run JSONL stream. `response.json` records schema version 1, effective recovery
bounds, timestamps, MTTD, MTTR, and intermediate durations. Run
`kill-worker-mid-batch-2026-10-04T04-19-35-332Z-791c2def` measured an unhealed MTTR of
6,939 ms with 394/394 operations and I1–I6 passing. MTTD is `null` because no controller
was running; this is intentional and prevents an invented detection claim.

## Rule-based controller

`harness/controller` monitors Docker state, evaluates immutable snapshots, plans from
hot-reloaded PostgreSQL policies, and executes verified restarts only against local,
labeled project containers. It exposes health and Prometheus metrics and emits the three
controller response events through the shared file protocol. Run
`kill-worker-with-controller-2026-10-04T04-38-33-079Z-6548b9dd` recorded MTTD 733 ms,
MTTR 8,581 ms, 281/281 successful operations, and I1–I6 passing. Day 17 repeated that
experiment ten times: MTTD median/p90/min/max was 632/872/615/1,004 ms and MTTR was
8,649/9,021/7,777/9,491 ms.

## FS-2 telemetry corruption

The metrics proxy has an authenticated local control surface with five allowlisted
modes: spike, drop, freeze, noise, and counter reset. Normal state is `none`; the runner
requires that state and valid integrity canaries during preflight and registers cleanup
before changing it. Application containers are not mutated by FS-2.

The controller validates required series, finite numbers, conservative bounds, source
freshness, and counter monotonicity on newer samples. Invalid telemetry emits one
`telemetry_invalid` event and uses Docker as an independent fallback; valid telemetry
after revert emits `telemetry_validated`. The runner monitors worker Docker health and
writes `fs2-assessment.json` with the action and false-action counts.

Runs `telemetry-spike-guard-2026-10-05T01-49-39-559Z-2497ff69`,
`telemetry-drop-guard-2026-10-05T01-50-41-396Z-3d4ba237`,
`telemetry-freeze-guard-2026-10-05T01-51-13-119Z-043cd742`,
`telemetry-noise-guard-2026-10-05T01-51-46-889Z-87bc668b`, and
`telemetry-counter-reset-guard-2026-10-05T01-52-15-989Z-1011ae07` all detected their
intended issue, kept the worker healthy, measured zero false actions, completed every
scheduled operation, and passed I1-I6. Day 17 then repeated every mode ten times. All 50
`fs2-assessment.json` files passed, with zero controller actions and zero false actions.
These are deliberate fault injections, not genuine findings.

## FS-3 sensor disruption

`services/metrics-proxy` is the single pass-through sensor for the payment API and worker
Prometheus jobs. FS-3 may stop only that labeled container. The runner requires healthy
proxy-backed jobs before injection, registers restoration before stopping it, and waits
for both jobs to return before recovery.

The controller emits a transition-based blind-mode alert when either required job is
missing/down, never derives a destructive action from absent data, and continues to use
Docker state for the current container restart policy. Run
`sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8` emitted blind and restored
events, no anomaly/plan/action events, completed 214/214 operations, and passed I1-I6.
The runner recorded 14,932 ms to recovery; MTTD is null because sensor loss was not
misclassified as an application anomaly. This is one functional run.

## FS-4 network faults

Toxiproxy is a required dependency boundary for API-to-PostgreSQL, API-to-Redis, and
worker-to-sink traffic. The runner validates the proxy allowlist, pre-registers an
idempotent toxic removal before injection, and removes the toxic before recovery checks.
Latency, jitter, timeout, and reset-peer modes are implemented; the TCP proxy does not
provide true packet loss.

PostgreSQL-latency run
`postgres-latency-retry-2026-10-04T04-46-57-637Z-c333a74c` completed with 31/105
successful client operations, 74 failures, and 2,013 ms client p95. I1–I6 passed for
acknowledged payments. This is evidence of severe availability degradation, not a
resilience-success claim or a new correctness defect.

Worker-to-sink timeout run
`sink-timeout-retry-2026-10-04T04-47-36-937Z-734ec032` completed 120/120 operations.
I1–I5 passed and I6 reported 24 event IDs delivered twice under the real fault. Those
duplicates are expected at-least-once transport behavior; no duplicate financial effect
was observed. Both evidence directories are preserved and both proxies were clean after
revert.

## Day 17 multi-run aggregation

Manifest `experiments/day17-matrix.yml` covers all 13 implemented experiment configs at
ten repeats each: 130 runs with ten controls, incremented seeds, and deterministic
pseudorandom injection offsets. The matrix runner serializes through the existing safety
lock and now waits for API, outbox relay, metrics proxy, sink, and Prometheus readiness
between repeats.

Matrix run `day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` completed 130/130
planned runs: 128 passed and two failed I5. Both failed run IDs are API-kill repetitions
of known F-001, each with two committed payments lacking delivery or dead letter:
`kill-api-after-commit-2026-10-05T02-35-20-685Z-363c6a04` and
`kill-api-after-commit-2026-10-05T02-37-15-648Z-ee48b428`. They are repeat evidence,
not new findings.

Per-fault median/p90 MTTR was FS-1 7,085/8,706 ms, FS-2 26,107/27,638 ms, FS-3
16,081/16,785 ms, and FS-4 8,829/11,143 ms. Only the ten controller-enabled FS-1 runs
emitted application anomaly events; their MTTD was 632 ms median and 872 ms p90. Missing
MTTD samples remain null and are counted, never replaced by zero or telemetry-state
events. All ten controls passed I1-I6; I1-I4 passed in all 130 runs; I5 passed 128/130;
I6 report-only outcomes retained 100% non-failure rates. See `docs/matrix.md` and the
matrix `aggregate.json` for min/max values, exact invariant rates, and all run IDs.

## Day 18 peak bug hunt

Manifest `experiments/day18-gap-matrix.yml` repeats Redis stop at 100 requests/second,
controller replacement during a verified worker outage at 50 requests/second, and 750
ms PostgreSQL latency with 100 ms jitter at 50 requests/second ten times each.

Matrix `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6` completed 30/30 with every
report and I1-I6 result passing. All ten controller restart assessments passed. Redis
outage recorded 1,836 successful and 8,063 failed client operations; PostgreSQL latency
recorded 880 successful and 4,089 failed operations. These are availability degradations,
not correctness defects. No new genuine finding emerged; the project remains at F-001
and F-002 plus explicitly synthetic S-001.

PostgreSQL is intentionally not labeled `chaos-target=true`. ADR-0011 keeps direct
source-of-truth container mutation outside this portfolio's blast radius and uses the
API-to-PostgreSQL Toxiproxy boundary for database-path disruption.

## Day 19 fix and proof

The payment transaction, schema migration, separate relay, deterministic queue identity,
health/readiness, Compose wiring, runner preflight, tests, ADR-0012, and outbox runbook
are implemented. The exact F-001 reproducer passed as described above.

## Day 20 CI and extensibility

`.github/workflows/ci.yml` now has quality, live integration, and bounded chaos-smoke
jobs. Smoke and integration diagnostics are uploaded even on failure, and cleanup always
runs. Dependabot covers npm and Actions; dependency review rejects newly introduced high
severity changes. `npm run demo` runs the same smoke path locally. `docs/extending.md`
and the tested `ExampleHttpFaultAdapter` define the required allowlist, preflight,
revert-before-mutation, timeout, testing, and evidence boundaries. `docs/safety.md`
consolidates the Docker-socket threat model and CI/operator rules.

Local one-command proof run
`ci-smoke-worker-kill-2026-10-05T04-24-22-895Z-9fce2893` injected worker SIGKILL,
completed 49/49 operations, passed I1-I6 for 47 unique acknowledged payments, and
recorded 4,852 ms unhealed MTTR. Afterward all nine services were healthy, telemetry mode
was `none`, every proxy had zero toxics, and no experiment lock remained.

## Day 21 release polish

The final README now leads with architecture, I1-I6, repeated results, F-001/F-002 proof,
quick start, and limitations. `CHANGELOG.md` records v1.0.0; `docs/demo-script.md` is the
reproducible recording walkthrough and explicitly says no video is checked in;
`docs/resume-bullets.md` contains only artifact-backed numbers. Root package version is
1.0.0 and the release commit is tagged locally as `v1.0.0`.

## Next implementation

No planned v1 feature remains. Future work is optional maintenance: push the release and
observe hosted CI, capture the scripted video, revisit Prisma advisories, or begin a
separately scoped v2. Do not add these as completed evidence until they actually occur.

## Handover documents

`docs/handover/` contains four current-state documents: the project introduction,
complete startup/runbook instructions for implemented components, an evidence-backed
Day 1-21 status history, and a concept-oriented study/debugging guide. Keep these files
current when component commands, milestone status, or architecture boundaries change.
