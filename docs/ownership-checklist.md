# Ownership checklist

This checklist measures observable capability, not reading progress. Check an item only
after performing it or explaining it from memory. Save notes and run IDs for practical
items; do not create new benchmark or defect claims without the corresponding artifacts.

## 1. Explain the product

- [ ] Give a two-minute explanation of the problem, solution, and intended audience.
- [ ] Draw the managed system, managing system, and all persistent boundaries.
- [ ] Trace one request and one event end to end using stable identities.
- [ ] Explain why recovery, availability, correctness, and resilience are different.
- [ ] State the project's limits without diminishing its demonstrated results.

## 2. Operate it safely

- [ ] Start every current component using the startup runbook.
- [ ] Verify service readiness and identify all exposed ports.
- [ ] Run the smoke path and locate its durable payment, ledger, outbox, and delivery state.
- [ ] Run a dry-run and explain every preflight decision.
- [ ] Run one control and one bounded fault experiment with recorded run IDs.
- [ ] Stop and restart cleanly without deleting evidence accidentally.
- [ ] Prove no container, process, toxic, or lock remains after an interrupted run.

## 3. Defend correctness

- [ ] Explain the transaction boundary for payment, ledger, and outbox.
- [ ] Demonstrate the concurrent idempotency race and its database resolution.
- [ ] Explain why Redis improves operation but does not authorize financial truth.
- [ ] State I1-I6, their data sources, scope, and failure semantics.
- [ ] Explain the control-run exception in ADR-0004.
- [ ] Distinguish queue/job deduplication, sink idempotency, and financial idempotency.
- [ ] Explain why at-least-once is compatible with one business effect.

## 4. Read and challenge evidence

- [ ] Locate config, journal, timeline, response events, invariants, cleanup, and report for
      an arbitrary run ID.
- [ ] Recalculate one reported latency from raw timestamps.
- [ ] Trace one aggregate sample back to its contributing run artifacts.
- [ ] Explain median, nearest-rank p90, min/max, sample count, and missing count.
- [ ] Identify a null measurement and explain why zero would be dishonest.
- [ ] Compare a synthetic corruption artifact with a genuine finding.
- [ ] State exactly what 130/130 completed runs do and do not establish.

## 5. Diagnose failures

- [ ] Diagnose an I1 or I2 failure from authoritative rows rather than logs alone.
- [ ] Diagnose an I5 failure across outbox, queue, sink, and observation-window evidence.
- [ ] Reconcile an ambiguous client timeout with committed database state.
- [ ] Distinguish application failure, dependency-path failure, and sensor failure.
- [ ] Explain a stalled-job replay and why early verification can miss it.
- [ ] Diagnose stale, missing, invalid, and reset telemetry separately.
- [ ] Form one wrong hypothesis and explicitly falsify it with evidence.

## 6. Understand the controller

- [ ] Walk through Monitor, Analyze, Plan, Execute, and Knowledge in one recorded run.
- [ ] Explain normal, guarded, blind, and actionable states.
- [ ] Show why a single telemetry anomaly cannot directly authorize mutation.
- [ ] Explain independent Docker-state corroboration and its limitations.
- [ ] Derive MTTD and MTTR only from explicit response events.
- [ ] Explain why zero false actions is scoped to the recorded FS-2 assessments.
- [ ] Name one unsafe remediation loop and the guard that prevents it.

## 7. Change it responsibly

- [ ] Complete at least Labs 1, 2, 4, 8, 9, and 10 from the rebuild guide.
- [ ] Add or change one small feature with focused tests and current documentation.
- [ ] Update `AI_CONTEXT.md` in the same conventional commit.
- [ ] Preserve run schema compatibility or document the intentional version change.
- [ ] Demonstrate rejection paths, interruption behavior, and cleanup for a safety change.
- [ ] Review the diff for unsupported claims and synthetic/genuine evidence mixing.
- [ ] Hand the repository to another person using only committed documentation.

## 8. Teach and defend it

- [ ] Answer every question in the deep question bank at score 2 or better.
- [ ] Score 3 on all architecture, correctness, safety, and debugging questions twice.
- [ ] Deliver a ten-minute architecture walkthrough without opening the README.
- [ ] Explain F-001 and F-002 as evidence chains, not just bug summaries.
- [ ] Defend one design choice, then argue for the strongest alternative.
- [ ] Conduct a mock incident review that separates cause, impact, detection, response,
      recovery, correctness, and prevention.
- [ ] Explain the next production-hardening priorities in risk order.

## Practical incident drills

Run these as tabletop exercises first. Use real injection only when the normal safety
preconditions pass.

### Drill A: The healthy liar

The API container is healthy, clients time out, and the metrics stream reports normal
latency. Determine which independent signals you need before acting.

### Drill B: The successful timeout

A client times out after submitting a payment. Show how to decide whether to retry and
how the same idempotency key prevents a second effect.

### Drill C: The missing webhook

The payment and outbox exist, but no sink delivery is visible. Separate relay backlog,
queue delay, worker retry, dead-letter, and too-short observation window.

### Drill D: The tempting restart

One error metric spikes while Docker reports the service healthy. Explain why the
controller should suppress action and what evidence would change the decision.

### Drill E: The interrupted injector

The runner exits while a toxic or paused service is active. Describe the registered
revert, restart-time inspection, manual verification, and evidence that cleanup completed.

## Suggested seven-session path

| Session | Focus                             | Deliverable                                    |
| ------- | --------------------------------- | ---------------------------------------------- |
| 1       | Introduction, diagram, startup    | Hand-drawn architecture and successful smoke   |
| 2       | Transactions, ledger, idempotency | Labs 1-3 notes                                 |
| 3       | Outbox, queue, sink               | Labs 4-5 notes and event trace                 |
| 4       | Metrics, load, invariants         | Labs 6-8 notes and synthetic detector fixtures |
| 5       | Safety and controller             | Labs 9-10 notes and cleanup proof              |
| 6       | Matrix, statistics, debugging     | Labs 11-12 diagnosis                           |
| 7       | Teach-back and extension          | Ten-minute review plus capstone proposal       |

## Final ownership exam

You can reasonably claim ownership when you can, without step-by-step assistance:

1. start and verify the complete current stack;
2. run a safe experiment and recover from an interruption;
3. trace a failed invariant to authoritative evidence;
4. explain and defend the transaction, delivery, telemetry, and safety contracts;
5. implement one bounded change with tests, docs, cleanup, and a resumable commit;
6. state what the evidence does not prove.

Passing is not “everything worked.” Passing is being able to predict, observe, explain,
and safely change both success and failure.
