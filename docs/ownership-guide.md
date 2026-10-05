# Application ownership guide

This guide turns repository familiarity into genuine ownership. Reading the source is not
enough: an owner can explain the system without notes, start and stop it safely, trace a
request across boundaries, reproduce a failure, defend the design tradeoffs, and make a
small change without weakening evidence or safety.

## The ownership path

Use these documents in order:

1. [Project introduction](handover/00-project-introduction.md) — what exists and why.
2. [Current startup runbook](handover/01-current-startup-runbook.md) — operate it.
3. [Challenges and improvements](challenges-and-improvements.md) — understand where the
   difficult design decisions came from.
4. [Study and debugging guide](handover/03-study-guide.md) — learn the underlying topics.
5. [Deep question bank](interview-questions.md) — explain and defend the system.
6. [Rebuild labs](rebuild-labs.md) — recreate the important mechanisms independently.
7. [Ownership checklist](ownership-checklist.md) — prove operational and design fluency.

The day-by-day history explains implementation order. The documents above are organized
by understanding and ownership rather than chronology.

## The five mental models to internalize

### 1. Recovery is not correctness

A healthy process answers a liveness question. I1-I6 answer data questions. Always inspect
both the recovery timeline and the invariant report before describing an experiment as
successful.

### 2. PostgreSQL is the financial authority

Redis improves coordination and carries asynchronous work, but it does not decide whether
a payment or balanced ledger exists. Unique constraints, transactions, triggers, and the
outbox row form the durable boundary.

### 3. Delivery is at-least-once

A worker can repeat transport after a crash. Duplicate webhook delivery is therefore not
automatically a bug. Duplicate financial effect is a bug, which is why event identity and
consumer idempotency matter.

### 4. The controller is also under test

The managed payment system and managing MAPE-K controller remain separate. Missing or
corrupt metrics must not trick the controller into a destructive action, so telemetry is
validated and corroborated against Docker state.

### 5. Evidence has identity and scope

Seeds reproduce workload shape, not persistent identity. Every run namespaces its data,
records exact event times, and links aggregate values back to run IDs. Synthetic fixtures
remain separate from genuine findings.

## What an owner should be able to do

Without copying commands blindly, you should be able to:

- draw the request, event, metrics, control, and evidence paths;
- explain why the API transaction contains payment, ledger, and outbox but not Redis;
- predict what happens when API, worker, Redis, sensor, or sink path fails;
- locate a run's config, client journal, timeline, response events, invariant output, and
  final report;
- distinguish liveness, readiness, availability, recovery, correctness, and resilience;
- explain every I1-I6 contract and its authoritative data source;
- safely run a dry-run, control, single fault, and matrix;
- verify all reverts and clean fault surfaces after interruption;
- reproduce F-001 before/after reasoning without manufacturing a new finding;
- change one component and name the tests, docs, and evidence that must change with it.

## Recommended ownership routine

1. Run the one-command demo and narrate each phase before reading its report.
2. Complete the rebuild labs in order, keeping your versions outside the main code path.
3. Answer the question bank aloud; write down every answer that depends on memorized text.
4. Perform the debugging drills with one variable changed at a time.
5. Present a ten-minute architecture review to another engineer or record yourself.
6. Implement one small extension using the extension definition of done.
7. Use the final checklist and require evidence for each checked item.

## Confidence levels

| Level | Evidence of ownership                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------- |
| 1     | Can start the stack and identify each component                                                           |
| 2     | Can trace a payment and explain I1-I6                                                                     |
| 3     | Can run faults, inspect artifacts, and diagnose common failures                                           |
| 4     | Can rebuild the core patterns and safely extend one boundary                                              |
| 5     | Can defend tradeoffs, lead an incident review, identify limitations, and design the next version honestly |

Do not use time spent in the repository as the confidence measure. Use observable tasks
from the checklist.
