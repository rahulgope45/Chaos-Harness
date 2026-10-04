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
|       16 | FS-2 telemetry corruption                | Not started                                      |
|       17 | Multi-run aggregation                    | Not started                                      |
|       18 | Full bug-hunt matrix                     | Partially pre-satisfied; full matrix pending     |
|       19 | Fix and prove                            | Partially pre-satisfied; F-001 fix pending       |
|       20 | CI, docs, extensibility                  | Partially complete                               |
|       21 | Final polish and v1 tag                  | Not started                                      |

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

## Day 16: FS-2 telemetry corruption — pending

**Planned:** Add spike, dropped-series/field, frozen/stale, noise, and counter-reset
modes. Validate bounds, monotonic counters, and staleness, and corroborate telemetry with
Docker state before destructive action.

**Why next:** Bad data can make an automated controller actively harmful. The required
result is a measured false-action count for every corruption mode.

## Day 17: Multi-run orchestration and reports — pending

**Planned:** Run each experiment at least ten times with seeds and varied injection
offsets. Aggregate MTTD/MTTR median, p90, min, max, and invariant pass rates into JSON and
Markdown.

**Why:** One functional run proves wiring, not performance or reliability distribution.
No median or p90 claim should be made until this milestone exists.

## Day 18: Full bug-hunt matrix — partially pre-satisfied

**Already achieved early:** Two genuine findings exist: F-001 in the service and F-002
in the harness. The requested count is therefore met without fabricating findings.

**Still pending:** Run the full matrix at peak load, including Redis down, PostgreSQL
latency/retries, controller restart during outage, and any explicitly approved PostgreSQL
target experiment. Triage every new violation with a minimal reproducer.

## Day 19: Fix and prove — partially pre-satisfied

**Already achieved early:** F-002 was fixed and regression-covered with run-isolated
keys.

**Still pending:** Fix F-001 with a transactional outbox and relay, then rerun the exact
same seed/config and preserve before/after artifacts. Do not mark the finding resolved
until I5 passes under the reproducer.

## Day 20: CI, documentation, and extensibility — partially complete

**Already present:** CI runs lint, formatting, typecheck, and unit tests. Core ADRs,
feature docs, safety notes, and these handover documents exist.

**Still pending:** CI integration tests, a short smoke chaos job with uploaded artifacts,
one-command demo, dependency automation/review, extension runbook, future-target adapter
example, and a consolidated Docker-socket security section.

## Day 21: Final polish — pending

**Planned:** Final architecture/results README using only aggregate measured values,
limitations, finding/fix summary, demo recording, v1.0.0 tag, and resume bullets based
only on verified evidence.

**Why last:** Final claims must reflect completed FS-2, N>=10 aggregation, and
before/after fixes rather than today's partial result set.
