# Most challenging parts and how they improved

The hardest work was not making containers fail. It was preserving enough trustworthy
evidence to decide whether the system recovered correctly. These are the main challenges,
their initial weaknesses, and the improvements that made the final result defensible.

## 1. Coordinating PostgreSQL commit and Redis publication

### Why it was difficult

The payment and balanced ledger belong in PostgreSQL, while webhook work belongs in
BullMQ/Redis. Those systems cannot share a local ACID transaction. The initial API
committed PostgreSQL first and then enqueued the job, creating a small but real crash
window.

### How the failure emerged

API SIGKILL run `kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` restored the
API process but failed I5: four committed payments had neither delivery nor dead-letter
state after draining. This proved that process recovery had hidden a data-loss defect.

### Improvement

The payment transaction now creates payment, balanced ledger entries, and one outbox row.
A separate relay publishes pending rows using the event UUID as BullMQ job ID and marks
the row published only after queue acceptance. The unchanged seed-301 reproducer then
passed I1-I6 in run `kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`.

### Remaining nuance

The outbox removes lost publication intent; it does not create exactly-once delivery. A
relay or worker can still repeat transport, so consumers remain idempotent and I1/I2 stay
the hard financial checks.

## 2. Separating duplicate delivery from duplicate effect

### Why it was difficult

BullMQ is at-least-once. Killing a worker around its side effect can produce a legitimate
redelivery. Treating every duplicate as invariant failure would call correct retry behavior
a defect; ignoring every duplicate would hide double side effects or unexplained control
noise.

### Improvement

ADR-0004 gives I6 context-sensitive semantics: unexplained duplicates fail a no-fault
control, while fault-induced duplicates are reported. I1/I2 always remain strict. The
worker crash investigation also added a delayed observation window so stalled-job replay
is not missed merely because it occurs after the first terminal delivery.

### Ownership lesson

Transport guarantees and business guarantees are different layers. Always ask whether a
message repeated and whether the repeated message changed authoritative state twice.

## 3. Keeping repeated runs isolated while retaining deterministic load

### Why it was difficult

The original seeded load generator used `load-<seed>-<index>` as the persisted idempotency
key. Reusing a seed reproduced both the schedule and database identity. Later runs could
reuse old payments and deliveries, producing false positives or false passes.

### Improvement

F-002 led to run-ID namespacing: the seed still controls timing, amount, and replay
placement, while every execution gets unique persistent identities. Aggregate reports
retain exact contributing run IDs, and invariant queries scope journal-window evidence.

### Ownership lesson

Reproducibility should control inputs, not accidentally alias durable entities across
independent trials.

## 4. Measuring response time without inventing detection

### Why it was difficult

The runner always knows when it injected a fault and when recovery criteria passed. That
does not mean the controller detected the fault. Substituting phase timestamps would make
MTTD appear complete even for runs without a controller.

### Improvement

MTTD and MTTR derive only from explicit response events. Runs without
`anomaly_detected` retain `null` MTTD, and aggregate reports count missing samples. Only
the ten controller-enabled FS-1 Day 17 runs contribute to their 632/872 ms median/p90
MTTD values.

### Ownership lesson

Missing evidence is a result, not zero. Define every measurement from named events before
collecting it.

## 5. Testing the controller when telemetry lies or disappears

### Why it was difficult

A controller that trusts one metrics stream can restart a healthy service when a sensor
spikes, freezes, drops series, returns non-finite values, or resets counters. A missing
query result is also ambiguous: application, proxy, scrape, or network may be responsible.

### Improvement

The metrics proxy became an independent FS-2/FS-3 boundary. The controller validates
required series, finite values, bounds, source freshness, integrity canaries, and counter
monotonicity. Missing telemetry enters blind mode; invalid telemetry enters guarded mode;
Docker state is the independent fallback. All 50 repeated FS-2 assessments recorded zero
actions and zero false actions.

### Ownership lesson

Observability is an input to control, so it needs validation, failure modes, and
independent corroboration like any other dependency.

## 6. Injecting real faults without escaping the intended blast radius

### Why it was difficult

Docker access is host-root-equivalent, fault cleanup can itself fail, and an interrupted
runner can leave services paused, stopped, or behind a toxic. Generic target names are
not sufficient safety controls.

### Improvement

The runner refuses remote Docker hosts, resolves the exact Compose project/service,
requires `chaos-target=true`, serializes experiments with a lock, applies a hard deadline
and error-rate abort, and registers idempotent reverts before mutation. FS-4 uses three
static proxies. PostgreSQL remains outside direct container mutation so evidence survives.

### Ownership lesson

Safety is part of the injector interface. A fault without preflight, bounded scope, and a
tested revert path is not an implemented feature.

## 7. Turning single examples into credible repeated evidence

### Why it was difficult

A single passing chaos demo can be timing luck. Repetition introduces new problems:
cross-run state, readiness between runs, varying offsets, long execution, partial
progress, missing measurements, and aggregate semantics.

### Improvement

The matrix runner uses versioned manifests, N>=10 enforcement, varied deterministic
offsets, readiness barriers, progress checkpoints, exact run links, and median,
nearest-rank p90, min, max, and missing counts. Day 17 completed 130/130 runs; Day 18
completed 30/30 additional gap runs.

### Ownership lesson

Aggregation is part of the experiment design. Define failure semantics and missing-data
handling before looking at the results.

## 8. Making the project operable by someone else

### Why it was difficult

Code can be correct while ownership remains trapped in one person's memory. Commands,
ports, evidence meanings, cleanup rules, limitations, and extension constraints all need
to agree as the architecture changes.

### Improvement

The repository now includes current-only startup instructions, day history, study and
debugging guidance, an outbox runbook, extension and safety contracts, a one-command demo,
release notes, a recording script, resume bullets, and this ownership curriculum.

### Ownership lesson

Documentation is an executable interface: validate links and commands, remove stale
component counts, and never let planned behavior appear as implemented behavior.

## The single hardest part

The most challenging part was **maintaining trustworthy causal evidence across
asynchronous boundaries and repeated failures**. The transactional outbox was the most
important service correction, but it was only discoverable because the journal,
run-isolated identity, drain semantics, terminal-event invariant, cleanup, and preserved
run artifacts all agreed. That full evidence chain—not container killing—is the core of
the project.
