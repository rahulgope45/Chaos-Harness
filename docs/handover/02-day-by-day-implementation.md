# Day-by-day implementation handover

The word **Day** below refers to a milestone in the original 21-day plan, not a calendar
date. Initial Day 1 scaffolding was committed from 2026-09-23 through 2026-09-25; the
remaining Day 1 work and implemented Days 2-14 were intentionally accelerated on
2026-10-04. Commit IDs and preserved run IDs are the evidence of what actually exists.

## Status at a glance

| Plan day | Milestone                                | Current status                                   |
| -------: | ---------------------------------------- | ------------------------------------------------ |
|        1 | Foundation                               | Complete                                         |
|        2 | Database invariants                      | Complete                                         |
|        3 | Payment API                              | Complete                                         |
|        4 | Queue, worker, webhook sink              | Complete                                         |
|        5 | Observability                            | Complete                                         |
|        6 | Load generator and baseline              | Complete                                         |
|        7 | Checkpoint                               | Complete, absorbed into surrounding verification |
|        8 | I1-I6 invariant checker                  | Complete                                         |
|        9 | Experiment runner                        | Complete                                         |
|       10 | Safety layer                             | Complete                                         |
|       11 | FS-1 service faults and initial bug hunt | Complete                                         |
|       12 | Response tracker                         | Complete                                         |
|       13 | Rule-based MAPE-K controller             | Complete                                         |
|       14 | FS-4 network faults                      | Complete                                         |
|       15 | Metrics proxy and FS-3                   | Complete                                         |
|       16 | FS-2 telemetry corruption                | Complete                                         |
|       17 | Multi-run aggregation                    | Complete                                         |
|       18 | Full bug-hunt matrix                     | Complete                                         |
|       19 | Fix and prove                            | Complete                                         |
|       20 | CI, docs, extensibility                  | Complete                                         |
|       21 | Final polish and v1 tag                  | Complete                                         |

## Day 1: Foundation

**What:** Created the npm-workspaces TypeScript monorepo, strict compiler settings,
ESLint, Prettier, Vitest, Zod environment validation, Docker Compose infrastructure,
GitHub Actions quality checks, initial README, and ADRs. PostgreSQL, Redis, Prometheus,
and Toxiproxy use pinned images, health checks, named volumes, a dedicated network, and
loopback-only published ports.

**Why:** Every later service and experiment needs a reproducible local base. Local-only
bindings and explicit `chaos-target=true` labels establish the safety boundary before
the project gains mutation capabilities.

**How:** npm workspaces share tooling while each package declares its own dependencies.
Compose uses `restart: "no"` so Docker does not hide recovery behavior from the future
controller. CI runs install, lint, format, typecheck, and unit tests.

**Evidence:** commits `90eb9de` through `981ee39`. No LICENSE was added because the
project owner explicitly deferred that choice.

## Day 2: Database invariants

**What:** Added Prisma 7 with the PostgreSQL driver adapter, payment and ledger models,
positive-amount checks, an append-only ledger trigger, and a deferred balance trigger.
Three live integration tests prove that PostgreSQL rejects an unbalanced commit, ledger
mutation, and duplicate idempotency key.

**Why:** Financial correctness must survive application bugs and concurrency. Enforcing
the rules in PostgreSQL prevents every application path from needing to reimplement
them correctly.

**How:** Prisma describes the schema and generates the client; hand-edited migration SQL
contains the PostgreSQL constraints and triggers. The balance trigger is deferred until
transaction commit so matching debit and credit rows can be inserted in either order.

**Evidence:** commit `0e60e78`.

## Day 3: Payment API

**What:** Added `POST /payments`, `GET /payments/:id`, `/healthz`, `/readyz`, structured
logging, graceful shutdown, request validation, and PostgreSQL-authoritative idempotency.
Redis provides a short in-flight lock and cache but the API remains correct when Redis
is unavailable.

**Why:** The harness needs a realistic stateful target with concurrency and retry
behavior. Payment creation is ideal because duplicates and partial writes have clear,
testable consequences.

**How:** A request hash distinguishes same-key replay from conflicting reuse. A unique
database key closes races that Redis cannot guarantee. Payment plus balanced ledger
entries are written in one transaction. Integration tests cover replay, mismatch,
50 concurrent same-key requests, lookup, and Redis fallback.

**Evidence:** commit `2f54f6c`.

## Day 4: Queue, worker, and webhook sink

**What:** Added a BullMQ webhook queue, separate worker, retry/backoff behavior, a
dead-letter queue, and a sink that persists every accepted delivery. All application
services received container images and Compose definitions.

**Why:** Asynchronous delivery creates realistic failure windows that cannot be tested
inside a single request/transaction. It also lets the project demonstrate at-least-once
processing and duplicate-delivery policy.

**How:** The API commits PostgreSQL first and then enqueues. The worker retries three
times with exponential backoff and dead-letters exhaustion. The sink can delay or fail
responses for controlled tests. ADR-0003 records enqueue-after-commit as an intentional
naive design and bug hypothesis.

**Evidence:** commit `d3c075d`; two live worker integration tests and an end-to-end
container delivery.

## Day 5: Observability

**What:** Added API request count/duration metrics, worker job count/duration metrics,
queue depth, `/metrics` endpoints, Prometheus scrape targets, and recording rules for
error rate, p95 latency, and throughput.

**Why:** Chaos experiments need an observable steady state and measurable recovery.
Without metrics, the runner could only guess whether the system recovered.

**How:** `prom-client` exposes counters, histograms, and gauges. Prometheus pulls the
metrics and recording rules precompute experiment-friendly series. Live traffic verified
both targets with `up=1`.

**Evidence:** commit `97cfdb5`.

## Day 6: Reproducible load generator and baseline

**What:** Added a seeded Poisson open-loop scheduler, realistic same-key retries and
replays, append-only JSONL attempt journals, and five preserved development baselines.

**Why:** Repeatable experiments require controlled load and client-side ground truth.
Server logs alone cannot prove what the client saw or acknowledged.

**How:** A seeded PRNG fixes workload shape while open-loop arrivals avoid making the
next request depend on the previous response. Every attempt records timestamps, key,
hash, status, and returned payment ID. The initial five short runs completed 228/228
operations with 38.2 ms mean client p95 and 9.451 requests/second mean throughput; these
are pipeline checks, not capacity claims.

**Evidence:** commit `61de23e` and `docs/baseline.md`.

## Day 7: Checkpoint

**What:** Reconciled the Compose stack, service traffic, ledger state, README, ADRs, and
baseline evidence. No new feature was intended for this milestone.

**Why:** A checkpoint prevents incomplete foundations from being hidden under harness
features.

**How:** The end-to-end service run, live database tests, Prometheus verification, and
baseline artifacts from Days 2-6 jointly satisfy the checkpoint. There is no dedicated
Day 7 commit because verification was captured with the relevant feature commits.

## Day 8: I1-I6 invariant checker

**What:** Implemented typed checks for idempotency, ledger balance, acknowledged writes,
atomicity, event completion/dead-lettering, and duplicate delivery. Every invariant was
also tested against an explicitly corrupted synthetic snapshot.

**Why:** A service returning to healthy is not proof of correct financial state. The
invariants turn correctness into executable postconditions.

**How:** The checker combines the selected client journal with PostgreSQL, sink records,
and BullMQ dead-letter state. Hard failures produce a non-zero exit code. I6 fails a
no-fault control but reports duplicates after a real fault, while I1/I2 always protect
financial effects.

**Evidence:** commit `d97a586`; clean run
`baseline-2026-10-04T03-03-43-143Z-s45-1a2c636b` passed I1-I6.

## Day 9: Experiment runner

**What:** Added Zod-validated YAML experiments, run locking, artifact directories,
Prometheus baselines, load orchestration, invariant verification, phase timelines, and
final reports.

**Why:** Repeatability requires one explicit lifecycle rather than manual fault commands
and screenshots.

**How:** The lifecycle is preflight, baseline, inject, observe, guaranteed revert,
recovery wait, verify, and report. Revert runs in `finally`. The first A/A control proved
that the harness itself did not create violations.

**Evidence:** commit `d1f230e`; control run
`no-fault-control-2026-10-04T03-24-48-758Z-3b023a1f` passed 56/56 and I1-I6.

## Day 10: Safety layer

**What:** Added local-Docker validation, project/service/label allowlisting, dry-run,
hard deadlines, signal cancellation, error-rate aborts, cancellable load, reverse-order
cleanup, and refusal-path tests.

**Why:** Fault injection is intentionally destructive. Safety has to be part of the
execution model, not a warning added afterward.

**How:** Docker targets must belong to project `chaos-harness` and carry
`chaos-target=true`. Every fault registers its revert before mutation. Abort signals
propagate to load and pending injection work.

**Evidence:** commit `e899299`; safety control
`no-fault-control-2026-10-04T03-33-27-280Z-adf0733d` passed and left all services healthy.

## Day 11: FS-1 and evidence-driven bug investigation

**What:** Added kill, stop, pause/unpause, and restart actions. Worker and API crash
experiments were run without a controller. Follow-up work added delayed duplicate
observation, fixed cross-run key contamination, and added one clearly labeled synthetic
duplicate-side-effect example.

**Why:** Process outages expose the difference between durable state, asynchronous work,
and client acknowledgement. The follow-up was necessary to avoid calling expected
at-least-once delivery or contaminated evidence a service bug.

**How:** Cleanup is registered before Docker mutation. I5 was widened to include every
payment committed during the journal window. Generated idempotency keys now contain the
unique load run ID. Duplicate observation is independent of the event drain timeout.

**Evidence:**

- `fc17071`: F-001, four committed payments lost their event after API SIGKILL.
- `c2f26cf`: F-002, repeated seeds contaminated evidence; fixed with run-isolated keys.
- `e42556f`: S-001 synthetic non-idempotent consumer, never reported as genuine.
- Worker run `kill-worker-mid-batch-2026-10-04T03-41-27-310Z-2d81a6eb` passed 394/394.
- API run `kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` failed I5 as F-001.

## Day 12: Response tracker

**What:** Added a versioned event protocol for `fault_injected`, `anomaly_detected`,
`plan_selected`, `action_executed`, and `recovered`, plus per-run MTTD/MTTR output.

**Why:** Recovery timing must come from actual boundary events. Substituting runner phase
times would invent controller performance that was never observed.

**How:** Runner and controller communicate through append-only JSONL, not direct calls.
MTTD is detection minus injection; MTTR is recovery minus injection. Missing controller
events remain `null`. Recovery requires the bound for consecutive samples.

**Evidence:** commit `c633212`; run
`kill-worker-mid-batch-2026-10-04T04-19-35-332Z-791c2def` recorded unhealed MTTR
6,939 ms and correctly left MTTD null.

## Day 13: Rule-based MAPE-K controller

**What:** Added Monitor/Analyze/Plan/Execute stages, PostgreSQL policy storage, hot reload,
hysteresis, cooldown, restart-window limiting, Docker safety rechecks, action
verification, controller health/metrics, and response events.

**Why:** FS-2 and FS-3 are meaningful only when there is a real managing system to test.
A policy-controlled loop also demonstrates safe automation without pretending ML is
needed.

**How:** Immutable snapshots feed pure analysis/planning functions. The current policy
detects a non-running worker on two consecutive observations, then restarts and verifies
it. Policies are rows rather than code constants. Standby-worker scaling was cut as
documented stretch scope.

**Evidence:** commit `bc4752f`; run
`kill-worker-with-controller-2026-10-04T04-38-33-079Z-6548b9dd` measured MTTD 733 ms,
MTTR 8,581 ms, 281/281 operations, and I1-I6 passing.

## Day 14: FS-4 network faults

**What:** Routed API-to-PostgreSQL, API-to-Redis, and worker-to-sink traffic through
static Toxiproxy paths. Added allowlisted latency/jitter, timeout, and reset-peer modes,
dry-run preflight, and automatic toxic cleanup.

**Why:** Dependency delay and connection failure exercise retry, timeout, and duplicate
delivery behavior without killing the service process itself.

**How:** Each toxic has a run-specific name and an idempotent removal registered before
injection. Toxiproxy changes TCP streams only; true packet loss is not claimed.

**Evidence:** commit `abd24fe`.

- PostgreSQL latency run `postgres-latency-retry-2026-10-04T04-46-57-637Z-c333a74c`
  had 31/105 successes and 2,013 ms p95. Correctness passed, availability degraded.
- Sink timeout run `sink-timeout-retry-2026-10-04T04-47-36-937Z-734ec032` completed
  120/120; I6 reported 24 expected transport duplicates and I1/I2 stayed clean.

## Day 15: Metrics proxy and FS-3

**What:** Added a pass-through metrics-proxy service for the API and worker scrape paths,
routed Prometheus through it, added a sensor-stop injector, and added controller blind
mode with unavailable/restored events and telemetry metrics.

**Why:** Missing metrics are not proof that an application failed. A controller that
restarts from absent data can turn a sensor outage into a real service outage.

**How:** FS-3 is schema-restricted to the local labeled `metrics-proxy`. The runner
verifies both proxy-backed jobs before injection, registers restoration before stopping
the proxy, and requires both jobs to return before recovery. The controller emits one
transition alert, makes no decision from missing telemetry, and continues to observe
Docker state as an independent fallback.

**Evidence:** run `sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8`
completed 214/214 operations with 46 ms client p95 and I1-I6 passing. It emitted
`telemetry_unavailable` and `telemetry_restored`, with zero anomaly, plan, or action
events. The runner measured 14,932 ms to restored telemetry plus the recovery bound.

## Day 16: FS-2 telemetry corruption

**What:** Added authenticated metrics-proxy spike, drop, freeze, noise, and counter-reset
modes; proxy integrity canaries; controller telemetry validation; guarded/validated
events; and per-run false-action assessment.

**Why:** Present data is not automatically trustworthy. A controller must distinguish
missing series, impossible bounds, stale samples, non-finite values, and unexplained
counter decreases before using telemetry for a destructive decision.

**How:** The runner requires valid normal telemetry, registers reset-to-`none` before
injection, and monitors the worker's Docker state independently. The controller rejects
bad samples and falls back to Docker. A run passes only when it detects corruption after
its own fault timestamp, validates after revert, observes a healthy worker throughout,
counts zero actions/false actions, and passes I1-I6.

**Evidence:** Five real runs passed:

- spike: `telemetry-spike-guard-2026-10-05T01-49-39-559Z-2497ff69`;
- drop: `telemetry-drop-guard-2026-10-05T01-50-41-396Z-3d4ba237`;
- freeze: `telemetry-freeze-guard-2026-10-05T01-51-13-119Z-043cd742`;
- noise: `telemetry-noise-guard-2026-10-05T01-51-46-889Z-87bc668b`;
- counter reset: `telemetry-counter-reset-guard-2026-10-05T01-52-15-989Z-1011ae07`.

Every scheduled operation succeeded, each worker stayed healthy, every false-action
count was zero, and I1-I6 passed. These are deliberate fault injections, not genuine
defect findings.

## Day 17: Multi-run orchestration and reports

**What:** Added a versioned matrix manifest, deterministic seed and bounded fault-offset
variation, serial orchestration through the safety lock, a between-run readiness barrier,
and aggregate JSON/Markdown reporting. Statistics include median, nearest-rank p90, min,
max, missing timing counts, strict invariant pass rates, and non-failure rates.

**Why:** One functional run proves wiring, not a distribution. Missing response events
must stay missing rather than becoming zero, and an application that is merely running
after a kill must not contaminate the next repeat before readiness returns.

**How:** `experiments/day17-matrix.yml` lists all 13 implemented configurations at ten
repeats each. Seeds increment per repeat and injection offsets are deterministic
pseudorandom samples from each entry's declared range. The matrix writes progress after
every run and links every aggregate value back to exact run IDs.

**Evidence:** matrix
`day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` completed 130/130 runs: 128 passed
and two failed I5. Both failures were API-kill repetitions of known F-001, each leaving
two committed payments without delivery or dead letter. All ten controls passed I1-I6,
I1-I4 passed across all 130 runs, and all 50 FS-2 assessments measured zero actions and
zero false actions.

Aggregate median/p90 MTTR was FS-1 7,085/8,706 ms, FS-2 26,107/27,638 ms, FS-3
16,081/16,785 ms, and FS-4 8,829/11,143 ms. Only ten controller-enabled FS-1 runs had
MTTD samples; their median/p90 was 632/872 ms. The report explicitly counts the other
MTTD values as missing.

## Day 18: Full bug-hunt matrix

**What:** Closed the uncovered hunt scenarios with Redis outage at 100 requests/second,
controller process replacement during a verified worker outage at 50 requests/second,
and 750 ms PostgreSQL latency with 100 ms jitter at 50 requests/second. Each scenario
ran ten times with distinct seeds and deterministic injection offsets.

**Why:** The Day 17 matrix covered the implemented catalog, but Redis loss and controller
replacement during an active outage did not yet exist, and PostgreSQL latency had not
been repeated at the higher load. The goal was to search honestly for additional defects,
not to manufacture a result after F-001 and F-002 already satisfied the two-finding goal.

**How:** Added explicit controller restart lifecycle events and
`controller-restart-assessment.json`. A configured run stops the first controller,
kills the worker, confirms Docker observes the worker down, starts a replacement
controller, and requires its successful recovery action plus final recovery. The
`experiments/day18-gap-matrix.yml` manifest owns the 30 repetitions. PostgreSQL remains
outside the direct container mutation allowlist; ADR-0011 chooses the narrower
API-to-PostgreSQL Toxiproxy path so the sink, controller policy store, and invariant
checker retain evidence access.

**Evidence:** matrix `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6` completed
30/30 with 30 passing reports. I1-I6 passed in every run, and all ten controller restart
assessments passed. Redis outage produced 1,836 successful and 8,063 failed client
operations; PostgreSQL latency produced 880 successful and 4,089 failed operations.
Those are real availability degradations, not correctness findings. No new defect was
found, so the genuine list remains F-001 and F-002; S-001 remains explicitly synthetic.

## Day 19: Fix and prove

**What:** Closed both genuine defects. F-002 was already regression-covered with
run-isolated keys. F-001 is now fixed by a transactional webhook outbox and separate
relay. The API stores the outbox row in the payment/ledger transaction; the relay
publishes pending rows with their event UUID as the BullMQ job ID and records success or
retry evidence.

**Why:** PostgreSQL commit and Redis enqueue cannot be one atomic write. Durable intent
inside PostgreSQL removes the API crash window, while a deterministic queue identity
makes a relay crash between enqueue and mark safe to retry.

**How:** Added the `webhook_outbox` migration, one-to-one payment relation, relay service,
port 3004 health/readiness, persisted attempts/errors, Compose wiring, runner/matrix
readiness checks, and unit/live integration coverage. Historical payments were not
backfilled, preventing unintended webhook replay and preserving the before-evidence
boundary. ADR-0012 records the choice and supersedes ADR-0003.

**Evidence:** The unchanged `experiments/kill-api-after-commit.yml` with seed 301 and a
two-second injection offset passed I1-I6 in run
`kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`. I5 checked 192 acknowledged
payments with no missing terminal event. Its run-window evidence records 201 committed
payments, 201 matching outbox rows, and 201 published rows. The original failing run
`kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` remains the before artifact.

## Day 20: CI, documentation, and extensibility

**What:** Expanded CI from static quality checks to live PostgreSQL/Redis integration
tests and a bounded worker-kill chaos smoke. Added evidence/log artifact upload, weekly
Dependabot groups, pull-request dependency review, a cross-platform `npm run demo`, an
extension runbook, a compile-tested future HTTP fault-adapter scaffold, and a consolidated
Docker-socket threat model.

**Why:** A portfolio harness should prove that its database behavior and real mutation
lifecycle work in a clean environment, make failures diagnosable, and show how to extend
the system without weakening its safety contract. Dependency changes also need review
instead of silently aging or landing unexamined.

**How:** The integration job starts only PostgreSQL and Redis, applies migrations, runs
the ten live tests, and uploads dependency logs. The smoke job uses the same one-command
demo as a developer: it provisions the full stack, runs `experiments/ci-smoke.yml`,
captures Compose state/logs, uploads the run directory, and always tears the stack down.
The adapter example permits only loopback control endpoints and allowlisted target/mode
pairs, preflights before mutation, and registers idempotent cleanup before its PUT.

**Evidence:** Workflow YAML, the demo launcher, experiment schema, Compose configuration,
94 unit tests, ten live integration tests, lint, formatting, and typecheck passed. Local
`npm run demo` produced run
`ci-smoke-worker-kill-2026-10-05T04-24-22-895Z-9fce2893`: all 49 operations succeeded,
I1-I6 passed for 47 unique acknowledged payments, and unhealed MTTR was 4,852 ms. All
nine services were healthy afterward with no lock, telemetry mode `none`, and zero
Toxiproxy toxics.

## Day 21: Final polish and v1 release

**What:** Rebuilt the README around the problem, nine-service architecture, I1-I6
contracts, measured matrix results, genuine finding/fix proof, quick start, safety, and
limitations. Added v1.0.0 release notes, a reproducible 4–6 minute recording script, and
role-specific resume bullets tied to exact run IDs. Bumped the root release manifest to
1.0.0 and created the local `v1.0.0` tag after the release commit.

**Why:** Presentation claims must be downstream of verified experiments. Completing this
after the matrices, genuine fixes, and final smoke prevents stale architecture diagrams,
inflated reliability language, or resume numbers without artifacts.

**How:** Every numeric README and resume claim was reconciled against the Day 17/18
aggregates, F-001 before/after artifacts, or the Day 20 smoke report. Missing MTTD stays
missing, availability degradation is not called resilience, S-001 remains synthetic,
and the README explicitly states that hosted CI/video are not yet claimed.

**Evidence:** Final gates cover 94 unit tests, ten live integration tests, lint,
formatting, strict typecheck, Compose/YAML validation, package version 1.0.0, clean fault
surfaces, and the preserved final smoke run
`ci-smoke-worker-kill-2026-10-05T04-24-22-895Z-9fce2893`.

## Post-plan ownership handover

After the Day 21 release, the documentation was extended with a consolidated challenge
narrative, deep interview/debugging questions, rebuild labs, incident drills, and an
evidence-based ownership checklist. This is a learning and handover milestone, not a new
runtime day or a change to the v1.0.0 evidence set.
