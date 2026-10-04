# Study guide and debugging map

This guide lists the concepts currently used by Chaos Harness. Study them in order: each
layer depends on the previous one. The descriptions are intentionally short; use the
named topic as the search term for deeper study, then locate its implementation in the
repository.

## 1. TypeScript and repository foundations

| Topic                 | What to understand                                                                                                             | Where it appears                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| npm workspaces        | Multiple packages share one lockfile while keeping package boundaries and dependencies.                                        | Root `package.json`, `services/`, `harness/`, `packages/` |
| ESM and NodeNext      | The repo uses native ES modules; TypeScript source imports use `.js` extensions because Node resolves the emitted module name. | `type: module`, `tsconfig.base.json`                      |
| Strict TypeScript     | `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` force uncertain values to be handled explicitly.        | `tsconfig.base.json`                                      |
| Runtime validation    | TypeScript types disappear at runtime; Zod validates environment variables, API bodies, experiment YAML, policies, and events. | `packages/config`, runner/controller schemas              |
| Deterministic tooling | Exact dependency versions, a Node version file, formatting, linting, typechecking, and tests reduce machine-to-machine drift.  | `.nvmrc`, `.npmrc`, CI workflow                           |

Debugging rule: a compile-time error belongs to TypeScript; a malformed external value
belongs to Zod; a process/environment mismatch belongs to config. Do not fix one layer by
silencing another.

## 2. Docker and local service composition

| Topic                 | Short description                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Containers vs images  | An image is the immutable template; a container is one running instance with state and networking.                      |
| Docker Compose        | Declares the eight-service local topology, dependencies, ports, volumes, labels, and health checks.                     |
| Health check          | A container-level probe used by Compose dependency ordering. It is not proof of business correctness.                   |
| Liveness vs readiness | Liveness says the process runs; readiness checks whether dependencies are usable. The API exposes both.                 |
| Named volumes         | Preserve PostgreSQL, Redis, and Prometheus state across `docker compose down`.                                          |
| Project labels        | Compose labels identify ownership; `chaos-target=true` is the explicit mutation allowlist.                              |
| Docker socket risk    | Docker API access is effectively host-root capability. The harness permits only local Docker and known labeled targets. |

Study the difference between `docker compose stop`, `down`, and `down -v`. The last one
deletes volumes and should not be part of routine debugging.

## 3. PostgreSQL and financial invariants

| Topic                       | Short description                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ACID transaction            | A unit of work that commits completely or rolls back. Payment and ledger rows share one transaction.                  |
| Database constraint         | A rule enforced for every writer, independent of application code. Positive amounts and unique keys use constraints.  |
| Unique-key race             | Two requests can pass an earlier read; the database unique constraint decides the winner safely.                      |
| Trigger                     | Database logic executed on a write. The ledger uses triggers for append-only and balance enforcement.                 |
| Deferred constraint trigger | Validation occurs at transaction commit, allowing debit and credit rows to be assembled before the balance check.     |
| Append-only ledger          | Existing entries cannot be updated or deleted, preserving an audit trail. Corrections should be compensating entries. |
| Double-entry accounting     | Every payment has equal debit and credit totals. The project demonstrates balance, not a complete accounting product. |
| Minor currency units        | Integers such as cents avoid floating-point money errors. PostgreSQL/Prisma use BigInt; JSON returns a string.        |
| Referential integrity       | Foreign keys prevent orphan ledger records; I4 additionally checks both directions as an experiment postcondition.    |
| Prisma driver adapter       | Prisma 7 uses `@prisma/adapter-pg`; Prisma is the query/schema tool while PostgreSQL owns critical invariants.        |

When debugging a data violation, first ask whether the rule should live in PostgreSQL or
only in one application path. Financial invariants normally belong in PostgreSQL.

## 4. API idempotency and concurrency

| Topic                    | Short description                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Idempotency key          | Repeating the same logical request returns the same result instead of creating a second payment.      |
| Request fingerprint/hash | The key is tied to amount and currency; reusing it with different content returns 422.                |
| Fast-path lock           | Redis `SET NX` reduces concurrent duplicate work, but it is not the final correctness boundary.       |
| Source of truth          | PostgreSQL decides whether the payment exists. Redis failure may reduce performance, not correctness. |
| Compare-and-delete lock  | A token-aware Lua delete avoids one requester releasing another requester's Redis lock.               |
| Graceful shutdown        | SIGTERM stops new work and closes resources so in-flight operations can finish when possible.         |
| Structured logging       | JSON logs and request IDs make one request traceable across failure symptoms.                         |

Important mental model: Redis prevents some races cheaply; PostgreSQL resolves all races
correctly. Never reverse those responsibilities.

## 5. Queues, retries, and distributed side effects

| Topic                        | Short description                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| BullMQ                       | A Redis-backed job queue used to separate payment commit from webhook delivery.                                  |
| At-least-once processing     | A job may run again after a crash. Consumers must tolerate repeated delivery.                                    |
| Exponential backoff          | Retry delays grow after failures, reducing immediate pressure on a failing dependency.                           |
| Stalled job                  | A worker that dies before acknowledging can leave work that BullMQ later reclaims and reruns.                    |
| Dead-letter queue            | Permanently failed jobs move to a separate queue for visibility and later handling.                              |
| Webhook delivery             | Transporting an event is not the same as applying its business side effect. Event IDs support deduplication.     |
| Duplicate delivery vs effect | Repeated HTTP delivery can be expected; a repeated charge/email/ledger effect is the actual correctness failure. |
| Dual-write problem           | A database commit and queue enqueue are two independent writes; crashing between them creates F-001.             |
| Transactional outbox         | The planned F-001 fix writes an event row in the same transaction, then a relay publishes it reliably.           |

The worker/sink boundary is the best place to study why retries require idempotent
consumers. Read ADR-0003, ADR-0004, F-001, and S-001 together.

## 6. Observability and Prometheus

| Topic                     | Short description                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| RED method                | Rate, Errors, and Duration summarize request-serving behavior.                                  |
| Counter                   | Monotonically increasing event total, such as completed jobs. Use rates over a time window.     |
| Gauge                     | Value that can rise or fall, such as queue depth.                                               |
| Histogram                 | Counts observations in buckets; Prometheus estimates p95 with `histogram_quantile`.             |
| Pull model                | Prometheus scrapes `/metrics`; the service does not push each observation to Prometheus.        |
| Scrape target `up`        | Shows whether Prometheus could scrape a target, not whether the business workflow is correct.   |
| Recording rule            | Stores a frequently used PromQL result such as error rate or p95 for simpler/faster queries.    |
| Structured event timeline | Metrics show aggregate behavior; JSONL response events preserve exact control-loop boundaries.  |
| Metrics proxy / sensor    | A pass-through hop makes the observation path independently stoppable for FS-3.                 |
| Missing data              | Absence is ambiguous: app, endpoint, proxy, network, or Prometheus may be responsible.          |
| Blind mode                | The controller declares telemetry unavailable and avoids decisions based on the missing values. |

Common trap: an empty PromQL vector is not automatically zero. The baseline work fixed a
zero-error rule so healthy periods record `0` rather than missing data.

## 7. Load generation and reproducibility

| Topic                     | Short description                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Seeded PRNG               | The same seed reproduces the workload shape for comparison. Identity must still be unique per execution.           |
| Poisson arrivals          | Exponential inter-arrival times model independent arrivals without a fixed periodic rhythm.                        |
| Open-loop load            | Requests are scheduled by time, not delayed until previous responses finish. It exposes saturation more honestly.  |
| Closed-loop load          | A client waits for a response before sending the next request; slowdown automatically lowers offered load.         |
| Client timeout            | The client can stop waiting while the server still commits. A timeout is an unknown outcome, not proof of failure. |
| Retry identity            | A retry must reuse the same idempotency key so an unknown outcome does not create another payment.                 |
| Append-only JSONL journal | Each attempt is one durable line, making partial runs inspectable and preserving client ground truth.              |
| Run isolation             | Seeded data shape is stable, but keys include the run ID so historical rows cannot contaminate new evidence.       |

F-002 is the practical lesson: reproducibility of workload values must not mean reuse of
persistent business identity.

## 8. Executable invariants

| ID  | Contract                                                                                 | Debug first                                               |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| I1  | One payment per idempotency key and one payment ID across successful replays.            | Journal keys/responses and `payments.idempotency_key`     |
| I2  | Debits equal credits per payment and globally.                                           | `ledger_entries`, trigger/migration, amount serialization |
| I3  | Every 2xx acknowledged payment still exists.                                             | Journal 2xx rows vs PostgreSQL payment IDs                |
| I4  | No payment without ledger entries and no orphan ledger entries.                          | Transaction boundaries and foreign keys                   |
| I5  | Every payment committed in the journal window is delivered or dead-lettered after drain. | Commit time, enqueue logs, BullMQ, sink, DLQ              |
| I6  | Count repeated delivery of the same event ID.                                            | Sink deliveries and injected-fault policy                 |

An invariant is a property that must hold across many implementation paths. The checker
returns violating rows, not just true/false, so reports can lead directly to diagnosis.

I6 is context-sensitive: unexplained duplicates fail the no-fault control, while
duplicates after a real fault are report-only. I1 and I2 remain strict so transport
retries can never excuse duplicate financial effects.

## 9. Chaos experiment design and safety

| Topic                | Short description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Fault vs failure     | A fault is the injected cause; a failure is an externally visible incorrect outcome.               |
| Hypothesis           | A falsifiable statement about recovery and correctness, written before injection.                  |
| Steady state         | Measurable normal behavior used as the baseline and recovery target.                               |
| Control/A-A run      | Runs the full harness without a fault to reveal harness-created false positives.                   |
| Blast radius         | The set of systems a fault can affect. Here it is limited to one local Compose project and labels. |
| Preflight            | Checks config, target, health, and dependencies before mutation.                                   |
| Guaranteed revert    | Cleanup is registered before mutation and executes in `finally`, including error paths.            |
| Kill switch/deadline | SIGINT/SIGTERM and maximum duration abort work and trigger cleanup.                                |
| Dry-run              | Resolves and validates a target while performing zero mutation.                                    |
| Evidence artifact    | Config, journal, timeline, events, checks, and report stored under a unique run ID.                |

Always run dry-run and a no-fault control after changing the runner or safety code. A
successful injected run is not trustworthy if the control run is noisy.

## 10. MAPE-K control loops

| Stage     | Current meaning in this project                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Monitor   | Check proxy-backed Prometheus availability and inspect Docker state for policy targets.              |
| Analyze   | Evaluate immutable snapshots and count consecutive policy breaches.                                  |
| Plan      | Select the PostgreSQL-backed action only if hysteresis, cooldown, and restart-window rules allow it. |
| Execute   | Restart the approved local container and verify its running state.                                   |
| Knowledge | Versioned, hot-reloaded policy rows in PostgreSQL.                                                   |

Related concepts:

- **Hysteresis:** require repeated bad observations so one transient sample does not act.
- **Cooldown:** wait after an action before allowing another.
- **Restart budget:** cap actions within a time window to prevent a restart storm.
- **Policy as data:** changing a validated row changes behavior without rebuilding code.
- **Separation of concerns:** the runner injects; the controller responds; JSONL events
  report timing without direct orchestration calls.
- **Independent corroboration:** missing Prometheus data does not override healthy
  Docker state. Present-but-corrupted telemetry validation is the Day 16 extension.

## 11. Response timing

| Measurement       | Definition                          |
| ----------------- | ----------------------------------- |
| MTTD              | `anomaly_detected - fault_injected` |
| Detection-to-plan | `plan_selected - anomaly_detected`  |
| Plan-to-action    | `action_executed - plan_selected`   |
| MTTR              | `recovered - fault_injected`        |

Recovery means the error-rate bound is satisfied for K consecutive samples. A missing
event produces `null`; the tracker never substitutes another timestamp. One run is a
functional result, while median/p90 claims require Day 17's N>=10 aggregation.

## 12. Network fault injection

| Topic                  | Short description                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| TCP proxy              | Toxiproxy sits between a client and dependency and mutates the byte stream.                     |
| Upstream/downstream    | Upstream is traffic toward the dependency; downstream is traffic back to the client.            |
| Latency                | Adds a fixed delay; jitter varies that delay.                                                   |
| Timeout toxic          | Stops data flow for the configured time, provoking client/worker timeouts.                      |
| Reset-peer toxic       | Closes the connection after the configured delay.                                               |
| Toxic cleanup          | Each experiment uses a run-specific toxic name and idempotent deletion.                         |
| Packet-loss limitation | TCP-stream toxics are not true per-packet loss; that would require a different privileged tool. |

When API calls suddenly time out, check the Toxiproxy API before debugging application
code. Outside an active experiment, all three proxy `toxics` arrays must be empty.

## 13. Testing and evidence discipline

| Test type             | Purpose                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Unit test             | Proves pure/local logic such as scheduling, policy evaluation, event ordering, or toxic shape. |
| Integration test      | Proves behavior against real PostgreSQL, Redis, queue, or HTTP boundaries.                     |
| End-to-end experiment | Exercises load, fault, recovery, and invariants together and preserves a run ID.               |
| Synthetic corruption  | Deliberately creates a known violation to prove the detector. It is not a discovered bug.      |
| Regression evidence   | Reruns the same reproducer after a fix and preserves before/after results.                     |

Bug classification used here:

- **Genuine:** emerged from a real run and has a reproducer and evidence, such as F-001
  and F-002.
- **Expected behavior:** duplicates after a worker fault are valid at-least-once transport
  behavior when no duplicate financial effect occurs.
- **Synthetic:** deliberately planted teaching/test behavior, such as S-001.
- **Degradation:** poor availability or latency without a violated correctness contract,
  such as the Day 14 PostgreSQL latency run.

## 14. Practical debugging sequence

Use this order so symptoms are narrowed from infrastructure to business state.

1. **Check process/container state:** `docker compose ps`.
2. **Check recent logs:** `docker compose logs --tail 100 <service>`.
3. **Check API liveness/readiness:** `/healthz` then `/readyz`.
4. **Check Toxiproxy cleanup:** `curl.exe -sS http://127.0.0.1:8474/proxies`.
5. **Check the sensor:** call the two port-3003 proxy routes, then open Prometheus targets.
6. **Check the experiment report and timeline:** determine which phase actually failed.
7. **Check the client journal:** distinguish timeout, 5xx, retry, and acknowledged result.
8. **Check invariants:** use violating IDs to query payment, ledger, sink, and queue state.
9. **Check controller evidence:** inspect `controller.log` and response-event ordering.
10. **Reproduce with the same experiment and seed:** change only one variable at a time.

### Symptom map

| Symptom                                        | First checks                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| API container healthy but `/readyz` is 503     | PostgreSQL/Redis health, Toxiproxy proxy state, API logs                                                      |
| POST timed out but payment may exist           | Reuse the same idempotency key, inspect journal and PostgreSQL; never generate a new key immediately          |
| Payment exists but webhook is absent           | API enqueue log/window, BullMQ queue/DLQ, worker logs, sink records; suspect F-001 window                     |
| Duplicate sink rows                            | Compare `event_id`; check injected fault and I6 policy, then verify I1/I2 for side effects                    |
| Worker stays stopped                           | Controller running, policy enabled, Docker label/project match, restart budget/cooldown, controller log       |
| Metrics missing                                | Direct service `/metrics`, proxy port 3003 routes/logs, Prometheus targets, scrape config, container network  |
| Experiment reports recovery but clients failed | Compare Prometheus recovery definition with load `summary.json`; correctness pass is not availability success |
| New run sees old rows                          | Confirm run-isolated idempotency keys and the selected journal time window                                    |
| Runner says another experiment is active       | Confirm no runner process, inspect timeline/cleanup, then handle only `.chaos-experiment.lock`                |

## Recommended study order

1. Docker Compose, health/readiness, and service networking.
2. PostgreSQL transactions, constraints, triggers, and double-entry balance.
3. HTTP idempotency and concurrency races.
4. Redis locking and PostgreSQL source-of-truth design.
5. BullMQ at-least-once jobs, retries, stalled work, and DLQs.
6. Prometheus metric types, PromQL rates, and histograms.
7. Open-loop load testing, seeded randomness, and client journals.
8. Chaos hypotheses, controls, blast radius, and guaranteed cleanup.
9. MAPE-K, hysteresis, cooldown, and policy-as-data.
10. Distributed dual writes and the transactional outbox pattern.

After each topic, reproduce one current test or experiment and explain its artifact chain
without looking at the implementation. That is the fastest way to become able to debug
the project rather than only describe it.
