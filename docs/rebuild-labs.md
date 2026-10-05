# Rebuild labs

These labs are the fastest route from familiarity to ownership. Build each mechanism in a
small scratch module or disposable branch, then compare it with the repository. Do not
change recorded findings or manufacture new ones. If you deliberately corrupt state to
test a checker, keep the output under `docs/synthetic/`.

For every lab, keep four notes: your prediction, the observed result, the evidence path,
and what changed in your mental model.

## Lab 0: Draw and trace the system

**Objective:** Understand the boundaries before changing code.

**Recreate:** Draw the request path, durable transaction path, asynchronous delivery path,
metrics path, controller loop, fault path, and evidence path. Trace one idempotency key and
one event UUID from client to final report.

**Break deliberately:** Remove one arrow from the diagram and explain which invariant or
operational capability becomes impossible.

**Proof:** You can redraw the system from memory and identify the authoritative store at
every boundary.

## Lab 1: Atomic payment and balanced ledger

**Objective:** Rebuild the financial correctness boundary.

**Recreate:** In a disposable schema, insert one payment plus matching debit and credit
entries in one transaction. Add the uniqueness and balance protections used by the real
design.

**Break deliberately:** Throw between the debit and credit insert, first without and then
with the transaction. Try a non-zero-sum ledger mutation.

**Proof:** Partial financial state never commits, and you can explain which guarantee came
from the application, transaction, constraint, and invariant query.

## Lab 2: Concurrent idempotency

**Objective:** See why a lookup is not a lock.

**Recreate:** Send two concurrent requests with the same logical key. Make the database
unique constraint the final arbiter and return the same payment to both callers.

**Break deliberately:** Temporarily implement only lookup-then-insert and synchronize both
requests immediately after the lookup.

**Proof:** You can reproduce the race in the weak version and show exactly one durable
payment in the corrected version.

## Lab 3: Optional Redis fast path

**Objective:** Separate performance from correctness.

**Recreate:** Add a Redis-assisted lookup or lock that reduces repeated database work but
falls back to PostgreSQL when Redis is missing.

**Break deliberately:** Pause or disconnect Redis during duplicate requests.

**Proof:** Latency or load may change, but the database still contains one payment and a
balanced ledger. You can explain why a cache miss is not proof of absence.

## Lab 4: Transactional outbox and relay

**Objective:** Close the database-to-queue dual-write gap.

**Recreate:** Write payment, ledger, and outbox in one database transaction. Build a small
relay that publishes with stable event identity and marks publication after acceptance.

**Break deliberately:** Stop execution after commit but before publish, and again after
publish but before recording success.

**Proof:** The first case retains pending durable intent. The second may retry transport
but cannot produce a second financial effect. Compare your reasoning with F-001.

## Lab 5: At-least-once worker and idempotent sink

**Objective:** Distinguish repeated delivery from repeated effect.

**Recreate:** Process a job, record delivery by event ID, and acknowledge it. Add retry and
dead-letter behavior.

**Break deliberately:** Kill the worker after the sink accepts the event but before job
acknowledgement.

**Proof:** A replay can be observed, the sink converges on one logical event, and final
state is delivered or dead-lettered. Explain why I6 is contextual while I1/I2 are strict.

## Lab 6: Metrics with truthful semantics

**Objective:** Instrument behavior without confusing observation and truth.

**Recreate:** Add a counter, histogram, queue/backlog gauge, and source-freshness signal.
Write down what each measurement means, its unit, and when it resets.

**Break deliberately:** Restart the instrumented process, return a stale timestamp, and
inject a non-finite or out-of-range sample through the metrics proxy.

**Proof:** You can identify counter reset, staleness, corruption, and genuine application
degradation as different cases.

## Lab 7: Seeded open-loop load and client journal

**Objective:** Reproduce workload shape without reusing persistent identity.

**Recreate:** Generate requests on a seeded schedule independent of response completion.
Record planned/send/complete times, logical request index, run-scoped idempotency key,
status, and ambiguity.

**Break deliberately:** Remove the run namespace and execute the same seed twice. Then
restore it and compare durable rows.

**Proof:** Timing and input shape repeat, persistent identity does not collide, and you can
explain F-002 without reading the finding.

## Lab 8: Invariant checker and tester tests

**Objective:** Treat verification as executable product code.

**Recreate:** Implement simplified versions of I1, I2, and I5 against isolated fixtures.
Make run scope and observation window explicit.

**Break deliberately:** Create three clearly labeled synthetic fixtures: a duplicate
effect, an imbalanced ledger, and a committed event with no terminal state.

**Proof:** Good fixtures pass, each bad fixture fails only its intended contract, and no
synthetic output is placed in genuine findings.

## Lab 9: One safe fault strategy

**Objective:** Learn the safety contract before adding fault variety.

**Recreate:** Implement a dry-run and then one bounded pause or kill strategy against an
explicitly labeled local Compose service. Register an idempotent revert before mutation.

**Break deliberately:** Interrupt after fault application and simulate a revert being
called twice. Attempt an unlabeled, wrong-project, or remote target.

**Proof:** Invalid targets are refused, interruption restores the service, repeat cleanup
is harmless, and post-run inspection shows clean fault surfaces.

## Lab 10: Minimal MAPE-K controller

**Objective:** Understand evidence-gated remediation.

**Recreate:** Monitor one validated metric plus independent Docker state, classify normal,
guarded, blind, and actionable states, and permit only one bounded action with cooldown.

**Break deliberately:** Feed it a spike, missing series, stale data, a reset counter, and a
real stopped service.

**Proof:** Sensor faults create response evidence but no service mutation; independently
confirmed service failure can authorize the intended action.

## Lab 11: A repeated experiment matrix

**Objective:** Turn a demonstration into repeatable evidence.

**Recreate:** Define a small versioned matrix with a control and at least one fault,
multiple seeds or offsets, readiness barriers, per-run artifacts, and an aggregate report.

**Break deliberately:** Omit one response event and abort one run halfway through.

**Proof:** The aggregate reports completion, failure, and missing measurements honestly;
it never converts missing data to zero, and every statistic links back to run IDs.

## Lab 12: Debug a cross-boundary failure

**Objective:** Practice investigation rather than command execution.

**Recreate:** Choose one existing run artifact and form a hypothesis without reading its
final conclusion. Align request journal, transaction/outbox state, queue state, sink state,
timeline, response events, and invariant output.

**Break deliberately:** Start with a plausible but wrong hypothesis and list the evidence
that falsifies it.

**Proof:** Your written diagnosis distinguishes cause, symptom, recovery, correctness,
and limitation, and another person can reproduce the reasoning from the same run ID.

## Capstone: Add one safe extension

Choose either a new fault, invariant, controller policy, or evidence view. Follow
`docs/extending.md` and keep scope small.

Your capstone is complete only when it has:

- a written hypothesis and contract;
- schema/config validation;
- unit and integration coverage proportional to risk;
- dry-run or synthetic negative coverage where appropriate;
- an explicit safety and cleanup story;
- immutable evidence with run identity;
- updated operator and ownership documentation;
- no unsupported claim of a genuine defect.

## Explain-back prompts

After every three labs, answer these without notes:

1. What state is authoritative, and what state is derived?
2. Which operation can repeat, and which effect must not repeat?
3. What evidence would disprove my current conclusion?
4. If the runner dies now, what remains broken and what restores it?
5. Which result is null or unknown rather than zero?

If any answer is vague, repeat the relevant lab with one variable changed.
