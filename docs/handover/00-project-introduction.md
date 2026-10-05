# Project introduction

## What this project is

Chaos Harness is a local chaos-engineering system for testing a small payment service
and the rule-based controller that recovers it. It deliberately asks two separate
questions after a fault:

1. Did the service recover?
2. Did the payment data remain financially correct?

Many demonstrations stop after proving that a process restarted or an endpoint became
healthy. That is not enough for a payment workflow: a recovered service can still have
lost a committed event, duplicated a financial effect, or acknowledged data that later
disappeared. This project treats recovery and correctness as separate outcomes and
stores evidence for both.

The project is a portfolio system, not a production payment processor. It demonstrates
distributed-systems reasoning, database-enforced invariants, observability, safe fault
injection, automated recovery, and evidence-based debugging using only local services.

## Why we are building it

The central problem is that restart, retry, and self-healing logic is often assumed to
work but is rarely tested under controlled failure. In financial software, an incorrect
recovery can be worse than an outage. The harness therefore creates repeatable failures,
measures the response, and verifies the final state instead of relying on a green health
check alone.

The design is influenced by the CHESS idea of testing the managing system as well as the
managed application. The controller follows MAPE-K: Monitor, Analyze, Plan, Execute over
a Knowledge store. The payment services and the controller are structurally separate so
the experiment can test either side without hiding direct coupling between them.

## Current architecture

```mermaid
flowchart LR
  Client[Client / load generator] --> API[Payment API]
  API --> PgProxy[Toxiproxy: api-postgres]
  PgProxy --> PG[(PostgreSQL)]
  API --> RedisProxy[Toxiproxy: api-redis lock path]
  RedisProxy --> Redis[(Redis / BullMQ)]
  Relay[Outbox relay] --> PG
  Relay --> Redis
  Redis --> Worker[Payment worker]
  Worker --> SinkProxy[Toxiproxy: worker-sink]
  SinkProxy --> Sink[Webhook sink]
  Sink --> PG

  Prom[Prometheus] --> Sensor[Metrics proxy / sensor]
  Sensor --> API
  Sensor --> Worker
  Runner[Experiment runner] --> Client
  Runner --> Prom
  Runner --> Docker[Local Docker API]
  Runner --> ToxiAPI[Toxiproxy API]
  Runner -->|FS-2 control / FS-3 stop| Sensor
  Runner --> Checks[I1-I6 invariant checker]
  Runner --> Matrix[Multi-run aggregate reporter]
  Checks --> PG
  Checks --> Redis
  Checks --> Sink

  Controller[Rule-based MAPE-K controller] --> Docker
  Controller --> Prom
  Controller --> PG
  Controller -. response events .-> Runner
```

### Managed system

- The payment API accepts idempotent payment requests.
- PostgreSQL is the source of truth and enforces ledger rules.
- Redis is a fast path and the BullMQ backing store, not the financial authority.
- The payment transaction atomically stores the payment, balanced ledger, and one
  webhook outbox row.
- A separate relay publishes pending outbox rows to BullMQ with deterministic job IDs.
- A separate worker retries delivery to a webhook sink and dead-letters exhausted jobs.
- Prometheus scrapes API and worker metrics through a sensor proxy with integrity
  canaries and an authenticated local chaos-control surface.

### Managing and experimental system

- The runner validates YAML and performs
  `preflight -> baseline -> inject -> observe -> revert -> recover -> verify -> report`.
- The safety layer restricts Docker actions to local, labeled Compose targets.
- FS-1 injects service outages through Docker.
- FS-2 injects allowlisted spike, drop, freeze, noise, and counter-reset telemetry modes
  without mutating the applications.
- FS-3 stops the metrics sensor so controller behavior under missing telemetry is tested.
- FS-4 injects TCP latency, jitter, timeout, and connection resets through Toxiproxy.
- The controller uses PostgreSQL-backed policies, hysteresis, cooldowns, and restart
  limits to restart a failed worker safely. Missing telemetry enters blind mode; corrupt
  telemetry enters guarded mode. Both fall back to independently observed Docker state.
- The response tracker records fault, telemetry state, detection, plan, action, and
  recovery events.
- The invariant checker evaluates I1-I6 after the experiment.

## What makes the project useful

The main differentiator is its evidence chain:

`experiment config -> client journal -> fault timeline -> controller events -> database,
queue, and sink checks -> final report`

Every measured claim is tied to a run ID and preserved artifact. A report may show that
correctness invariants passed while availability was poor; the project does not rename
that outcome as resilience. Synthetic corruption used to prove the checker is kept
separate from genuine findings.

## Current verified state

Plan milestones Day 1 through Day 20 are implemented. The repository currently has:

- nine healthy Docker Compose services;
- 94 unit tests and 10 live integration tests passing, including outbox relay coverage;
- an idempotent payment API, balanced ledger, queue worker, sink, and Prometheus metrics;
- reproducible load generation and I1-I6 checks;
- a safe experiment runner with FS-1 through FS-4;
- a response tracker and rule-based MAPE-K worker-restart controller;
- a manifest-driven N>=10 matrix runner with JSON and Markdown aggregate reports;
- CI quality, live integration, and bounded chaos-smoke jobs with uploaded evidence;
- a one-command local demo and compile-tested fault-adapter extension scaffold;
- two genuine findings and one explicitly synthetic scenario.

Day 17 matrix `day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` completed all 130
planned runs. All ten controls passed I1-I6. The only two failed reports were I5 failures
from `kill-api-after-commit`, reproducing existing F-001; all other 128 reports passed.
All 50 telemetry-corruption assessments recorded zero false actions.

Day 18 matrix `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6` completed 30/30
added peak-load runs: ten Redis outages, ten controller replacements during observed
worker outages, and ten PostgreSQL-latency runs. All reports and every I1-I6 result
passed. All ten controller restart assessments passed. Redis and PostgreSQL disruption
caused real client-visible degradation, but no new correctness defect emerged.

Day 20 one-command run `ci-smoke-worker-kill-2026-10-05T04-24-22-895Z-9fce2893`
injected worker SIGKILL, completed 49/49 operations, passed I1-I6 for 47 unique payments,
and left all nine services healthy with every fault surface clean.

The genuine findings are:

- F-001: a committed payment can lose its webhook event if the API dies between database
  commit and queue enqueue. It is resolved by the Day 19 transactional outbox; the
  unchanged reproducer now passes I1-I6.
- F-002: stable idempotency keys across repeated seeded runs contaminated later evidence;
  generated keys are now namespaced by run ID.

S-001 deliberately models a non-idempotent webhook consumer. It is a teaching fixture,
not a discovered defect.

## Current boundaries

- Local Docker Compose only; no production or remote Docker targets.
- Rule-based controller only; no ML in the critical path.
- Toxiproxy provides TCP-stream faults, not true packet loss.
- Results are functional development evidence, not production capacity claims.
- PostgreSQL process loss is not tested: the source-of-truth container remains outside
  the mutation allowlist; ADR-0011 records the blast-radius decision.
- Final README/results polish, demo recording, and the v1 tag remain pending.
- No LICENSE has been selected yet, by explicit project decision.

Read next:

- `01-current-startup-runbook.md` to run the current system.
- `02-day-by-day-implementation.md` for implemented and remaining milestones.
- `03-study-guide.md` for the concepts and debugging path.
