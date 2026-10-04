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

## 2026-10-04 — I1–I6 invariant checker

- Added typed I1–I6 queries over the client journal, PostgreSQL, webhook deliveries,
  and BullMQ dead-letter state, with a non-zero exit code for hard failures.
- Implemented ADR-0004's derived I6 policy: duplicate deliveries fail no-fault controls
  and default to report-only after a real injected fault.
- Proved every invariant fires from its own explicitly synthetic corrupted snapshot.
- Ran the checker against baseline run
  `baseline-2026-10-04T03-03-43-143Z-s45-1a2c636b`; all six passed after tracing four
  initial I4 violations to leaked `duplicate-*` test fixtures.
- Fixed the duplicate-key integration test to roll back, removed only the four exact
  leaked fixture rows, and preserved both contaminated and clean reports.
- Next: implement the experiment runner and safety layer before fault injection.

## 2026-10-04 — Experiment runner and A/A control

- Added Zod-validated YAML experiments, single-run locking, phase timelines, Prometheus
  steady-state snapshots, seeded load execution, invariant verification, and reports.
- Guaranteed the revert phase with `finally` and a failure-path unit test.
- Refused all non-control faults until the safety layer and injectors exist.
- Ran no-fault control `no-fault-control-2026-10-04T03-24-48-758Z-3b023a1f`: 56/56
  operations succeeded and I1–I6 passed under the strict no-fault I6 policy.
- Next: build and test the safety layer before enabling FS-1.

## 2026-10-04 — Safety boundary

- Added local-Docker validation, Compose-project and `chaos-target=true` allowlisting,
  dry-run mode, a hard deadline, signal aborts, an error-rate watcher, and LIFO reverts.
- Added refusal/abort tests plus load cancellation; Dockerode was upgraded to 5.0.1 to
  avoid its older transitive UUID advisory.
- Live dry-run approved only the labeled `payment-api` target with zero mutations.
- Safety-wrapped control `no-fault-control-2026-10-04T03-33-27-280Z-adf0733d` passed
  56/56 operations and I1–I6; all seven services remained healthy afterward.
- Next: add FS-1 actions behind this boundary and run the first unhealed experiments.

## 2026-10-04 — FS-1 and first genuine finding

- Added kill, stop, pause, and restart actions with recovery registered before mutation.
- Worker-kill run `kill-worker-mid-batch-2026-10-04T03-41-27-310Z-2d81a6eb` passed
  394/394 operations and I1–I6; the worker was restored healthy.
- Corrected I5 to include every payment committed during the journal time window, not
  only payments whose client received a 2xx response.
- API-kill run `kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` confirmed
  F-001: four committed payments had no delivery or DLQ record after a 45-second drain.
- Preserved the failed report and documented the enqueue-after-commit root cause and
  transactional-outbox remediation. Both killed services were restored healthy.
- Next: hunt the worker crash-after-side-effect duplicate candidate without counting
  deterministic synthetic fixtures as genuine evidence.

## 2026-10-04 — Worker crash duplicate policy and second genuine finding

- Added a sink response-delay mode to reproduce the real crash-after-side-effect window
  without planting duplicate rows or bypassing the worker.
- The first run showed four duplicate deliveries appearing after the original I6 check;
  I6 now has a dedicated delayed-duplicate observation window.
- A repeated-seed run exposed genuine harness finding F-002: load keys were stable across
  runs, so historical payments and deliveries contaminated new evidence.
- Namespaced generated idempotency keys by unique run ID and added regression coverage.
- Fixed run `kill-worker-after-side-effect-2026-10-04T04-04-15-336Z-b564632d` completed
  153/153 operations; I1–I5 passed and I6 reported four expected transport duplicates.
- Classified the duplicates as report-only under ADR-0004 because no duplicate financial
  effect occurred.
- Next: add one clearly labeled synthetic defect demonstration, then implement the
  Day 12 response tracker.

## 2026-10-04 — Explicit synthetic scenario S-001

- Added a deliberately non-idempotent webhook consumer fixture that sends a receipt
  email effect once per delivery without deduplicating `event_id`.
- Replayed one event twice and generated deterministic evidence showing two side effects.
- Labeled the implementation, test, documentation, and artifact as synthetic; it is not
  counted as a genuine finding.
- Next: implement the Day 12 response tracker before the controller and FS-4.

## 2026-10-04 — Response tracker

- Added a versioned event schema for fault injection, detection, planning, action, and
  recovery, carried over an append-only JSONL stream with no controller/runner calls.
- Added validated per-run response JSON with MTTD, MTTR, intermediate durations, and the
  effective recovery bound. Missing controller events remain `null`.
- Added synthetic timing, invalid-order, and cross-process stream tests; the suite has 33
  passing tests.
- Live FS-1 run `kill-worker-mid-batch-2026-10-04T04-19-35-332Z-791c2def` completed
  394/394 operations with I1–I6 passing and recorded an unhealed MTTR of 6,939 ms.
- MTTD is correctly absent because the controller has not been implemented.
- Next: implement the Day 13 rule-based MAPE-K controller and connect its middle events.

## 2026-10-04 — Rule-based MAPE-K controller

- Added versioned PostgreSQL controller policies with database checks and a seeded
  worker-restart policy; enabled policies are reloaded every cycle.
- Added pure immutable analysis/planning with two-observation hysteresis, cooldown, and
  max-restarts-per-window protection.
- Added local Docker and label checks, restart execution with post-action verification,
  controller health/metrics endpoints, and structured logs.
- Added controller-enabled experiment orchestration as a separate process communicating
  through the response-event stream.
- Live run `kill-worker-with-controller-2026-10-04T04-38-33-079Z-6548b9dd` measured
  MTTD 733 ms and MTTR 8,581 ms; 281/281 operations succeeded and I1–I6 passed.
- The unit suite has 40 passing tests. Standby-worker scaling was omitted as documented
  stretch scope.
- Next: implement Day 14 FS-4 latency, jitter, timeout, and reset-peer injection through
  Toxiproxy.

## 2026-10-04 — FS-4 network fault injection

- Routed API-to-PostgreSQL, API-to-Redis, and worker-to-sink traffic through three
  statically configured Toxiproxy proxies.
- Added allowlisted latency/jitter, timeout, and reset-peer toxics with dry-run
  preflight and idempotent LIFO removal registered before mutation.
- PostgreSQL-latency run
  `postgres-latency-retry-2026-10-04T04-46-57-637Z-c333a74c` had 31/105 successful
  client operations, 74 failures, and 2,013 ms client p95. I1–I6 passed for acknowledged
  payments; this is severe availability degradation, not resilience success.
- Worker-to-sink timeout run
  `sink-timeout-retry-2026-10-04T04-47-36-937Z-734ec032` completed 120/120 operations.
  I1–I5 passed and I6 reported 24 expected duplicate event IDs with no duplicate
  financial effect.
- Verified automatic toxic removal after both runs. The unit suite has 43 passing tests.
- Next: implement Day 15 FS-3 observability faults through a metrics proxy.

## 2026-10-04 — Current-state handover documentation

- Added a project introduction explaining the recovery-plus-correctness goal and current
  managed/managing architecture.
- Added a PowerShell startup runbook covering every implemented Compose and host process,
  verification, experiments, logs, and safe shutdown.
- Reconciled all 21 plan days against commits and run evidence, explicitly separating
  completed, partially pre-satisfied, and pending milestones.
- Added a concept study guide and symptom-first debugging map for the technologies and
  distributed-systems decisions used by the current project.
- Corrected the safety document's stale statement that fault injection was disabled.
- Next: implement Day 15 FS-3 observability faults through a metrics proxy.

## 2026-10-04 — FS-3 sensor disruption and controller blind mode

- Added a pass-through metrics-proxy service and routed both Prometheus application jobs
  through its target-specific endpoints.
- Added an allowlisted FS-3 action that can stop only the labeled metrics proxy, registers
  restoration before mutation, and waits for proxy-backed scrape recovery.
- Added controller telemetry monitoring, blind-mode/restoration events, availability
  metrics, and Docker-state fallback with no action inferred from missing data.
- Live run `sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8` completed
  214/214 operations with I1-I6 passing. It emitted blind and restored events with zero
  anomaly, plan, or action events.
- Verified all eight Compose services healthy after automatic restoration. The suite has
  54 passing unit tests and 10 passing integration tests.
- Next: implement Day 16 FS-2 telemetry corruption and false-action measurement.
