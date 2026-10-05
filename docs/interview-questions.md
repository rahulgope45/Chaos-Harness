# Deep question bank

Use this as an ownership test, not a script to memorize. A strong answer should name the
contract, explain the mechanism, point to evidence, and admit the remaining limitation.
Answer aloud before opening the linked implementation documents.

## Architecture and system boundaries

### 1. What is this project actually testing?

**Strong answer:** It tests whether a small asynchronous payment system remains both
available and correct under controlled failures. Docker recovery is only one signal. The
harness also checks financial invariants, terminal event state, telemetry behavior,
controller actions, cleanup, and evidence completeness.

**Go deeper:** Explain why a healthy container can coexist with a failed I5 result.

### 2. What are the managed and managing systems?

**Strong answer:** The managed system is the API, PostgreSQL, Redis/BullMQ, worker,
webhook sink, metrics path, and network proxies. The managing system is the runner plus
the optional MAPE-K controller. Keeping them separate makes controller decisions and
application behavior independently observable.

**Go deeper:** Identify which Docker access belongs to each side and why that boundary is
safety-sensitive.

### 3. Trace one successful payment end to end.

**Strong answer:** The client sends a run-scoped idempotency key. The API transaction
creates or reuses the payment, writes balanced ledger entries, and inserts one outbox row.
The relay publishes that event to BullMQ using the event UUID as job identity. The worker
delivers it to the sink, which records the event idempotently. Metrics, the client journal,
timeline events, and invariant queries describe the same execution from different views.

**Go deeper:** Name what remains durable if Redis is unavailable immediately after the
database commit.

### 4. Why is PostgreSQL the source of truth instead of Redis?

**Strong answer:** Financial state needs transactional constraints, durable relationships,
and authoritative queries. Redis is appropriate for queueing and coordination but can be
unavailable or replay work. Payment, ledger, outbox, and invariant state therefore live in
PostgreSQL; Redis carries work derived from that durable intent.

**Go deeper:** What corruption could occur if the ledger existed only in a queue job?

### 5. Why use proxies as explicit network boundaries?

**Strong answer:** Toxiproxy makes latency, timeout, and connection-loss faults explicit,
bounded, reversible, and inspectable. Static proxy boundaries avoid dynamic topology
changes during an experiment and let the safety layer target one known dependency path.

**Go deeper:** Explain why PostgreSQL is deliberately protected from direct container
mutation even though its network path can still be impaired.

## Transactions, ledger integrity, and idempotency

### 6. What guarantee does API idempotency provide?

**Strong answer:** Repeating the same logical request must resolve to one payment rather
than duplicate financial effects. A database uniqueness constraint is the final arbiter;
an optional Redis fast path can reduce work but cannot be the correctness boundary.

**Go deeper:** Describe the race when two instances receive the same key concurrently.

### 7. Why is a pre-insert lookup insufficient for idempotency?

**Strong answer:** Two requests can both observe absence before either commits. Both then
attempt insertion. Only an atomic database constraint closes that race; the losing path
must resolve the existing row rather than turn a normal race into a second effect.

**Go deeper:** Which isolation assumptions still matter around the lookup-after-conflict
path?

### 8. What does balanced ledger mean here?

**Strong answer:** Every payment's ledger entries sum to zero, so credits and debits are
represented as one atomic financial event. The payment and its ledger rows are committed
together, and I2 independently checks the resulting state.

**Go deeper:** Why are application checks alone weaker than database constraints and an
independent post-run invariant?

### 9. Why should Redis never be required to decide whether a payment exists?

**Strong answer:** A cache miss is ambiguous and Redis can be partitioned, flushed, or
stale. Letting it decide existence would make correctness depend on an availability
component. PostgreSQL uniqueness keeps the decision durable and consistent across API
instances.

**Go deeper:** What is the safe degradation mode when the Redis fast path is unavailable?

### 10. What is the difference between request identity and run identity?

**Strong answer:** Request identity deduplicates retries within one logical workload. Run
identity isolates separate experiments. The seed may reproduce timing and input shape,
but persisted keys include the run namespace so rerunning a seed does not alias old rows.

**Go deeper:** Explain the F-002 failure mode caused by using only seed and request index.

## Outbox, queues, and delivery semantics

### 11. Why was the transactional outbox necessary?

**Strong answer:** PostgreSQL and Redis cannot participate in one local transaction. The
old database-then-enqueue sequence had a crash window that lost publication after a valid
payment commit. Writing an outbox row in the payment transaction preserves publication
intent until a relay can enqueue it.

**Go deeper:** Cite the failing and passing F-001 run IDs from the challenge document.

### 12. Does the outbox provide exactly-once delivery?

**Strong answer:** No. It provides durable intent and supports eventual publication, but a
relay can publish and crash before recording success. BullMQ workers can also retry. The
design is at-least-once, with stable event identity and idempotent consumers preventing
duplicate business effects.

**Go deeper:** Identify every place a duplicate can arise after the API transaction.

### 13. Why use the event UUID as the BullMQ job ID?

**Strong answer:** Stable job identity lets repeated relay attempts converge on the same
logical work item while preserving traceability from the outbox through delivery evidence.
It reduces accidental duplicate jobs but does not remove the need for sink idempotency.

**Go deeper:** Why is queue-level deduplication alone not a sufficient business guarantee?

### 14. What does an outbox relay have to get right?

**Strong answer:** It must claim pending rows safely, publish with stable identity, record
success only after queue acceptance, retry transient failure, expose backlog/age, and avoid
one poison item blocking all progress. Multiple relay instances must not corrupt state.

**Go deeper:** Compare polling, notification-assisted polling, and change-data-capture as
future relay implementations.

### 15. When is a duplicate webhook delivery acceptable?

**Strong answer:** It can be expected after an injected fault because BullMQ is
at-least-once. I6 reports it in that context. It is unexplained and therefore fails a
no-fault control. In every context, I1 and I2 must prove that transport repetition did not
create duplicate financial effects.

**Go deeper:** Why is a single global duplicate policy less accurate?

### 16. Why does drain semantics matter after a worker crash?

**Strong answer:** Stalled-job recovery can occur after the first apparent terminal event.
If verification stops too early, it can miss a legitimate replay or classify unfinished
work incorrectly. The harness therefore observes a bounded delayed window before final
invariant evaluation.

**Go deeper:** What tradeoff exists between a longer drain window and experiment speed?

### 17. What is the purpose of dead-letter state?

**Strong answer:** It makes terminal failure explicit after retry policy is exhausted. I5
requires every committed publication intent to become delivered or dead-lettered, so
silent disappearance is not mistaken for recovery.

**Go deeper:** Which metadata would you preserve to make a dead-letter actionable?

## Invariants and evidence

### 18. Why are health checks not enough?

**Strong answer:** Health checks answer whether a process or dependency can respond. They
do not prove one payment, a balanced ledger, one publication intent, or terminal delivery.
A system can restart cleanly after losing committed work, as F-001 demonstrated.

**Go deeper:** Give one liveness signal and one correctness signal for the same run.

### 19. What are I1-I6 protecting?

**Strong answer:** Together they protect idempotent payment effects, balanced ledger
state, expected payment/journal correspondence, outbox/event completeness, terminal
delivery state, and context-aware duplicate delivery. The exact executable contracts and
authoritative queries are documented in `docs/invariants.md`.

**Go deeper:** Explain which are hard business invariants and why I6 is contextual.

### 20. Why query authoritative state instead of trusting API responses?

**Strong answer:** The client sees acknowledgements, timeouts, and connection failures,
not commit truth. A timed-out request may have committed. Post-run database and sink
queries reconcile client observations with durable outcomes.

**Go deeper:** How should a client safely retry after an ambiguous timeout?

### 21. What makes a run artifact trustworthy?

**Strong answer:** It has a unique run ID, immutable effective config, seed, exact event
timestamps, request journal, response events, invariant output, cleanup record, and links
from aggregates back to the contributing runs. Missing or invalid evidence stays visible.

**Go deeper:** Which artifact would you inspect first for an I5 failure, and which next?

### 22. Why keep synthetic invariant fixtures separate from genuine findings?

**Strong answer:** Deliberate corruption proves that the checker can detect known bad
states, but it is not evidence that the application naturally produced that defect.
Separating directories and language prevents a tester validation from becoming a false
product claim.

**Go deeper:** Design a synthetic fixture for each of I1, I2, and I5.

### 23. Why is a no-fault control required?

**Strong answer:** It estimates harness noise and establishes that the workload, metrics,
queue, invariant checker, and cleanup do not fail on their own. Without it, a failure
correlated with injection may still be a baseline defect.

**Go deeper:** What should happen if the control produces an unexplained duplicate?

### 24. What is the difference between a genuine bug and a fabricated bug?

**Strong answer:** A genuine bug emerges from the unmodified system under a legitimate
experiment and has reproducible artifacts. A fabricated or synthetic bug is deliberately
introduced to validate detection. Both can be useful, but only the first belongs in
findings; the second belongs in synthetic tester evidence.

**Go deeper:** Why would mixing them damage the credibility of the portfolio?

## Fault injection and safety

### 25. What makes a chaos experiment safe enough to run?

**Strong answer:** It has explicit preconditions, an exact target, bounded duration,
abort thresholds, a registered idempotent revert, a global lock, a hard deadline, durable
evidence, and post-run verification that all fault surfaces are clean.

**Go deeper:** Explain why cleanup must run after both success and failure.

### 26. Why reject a remote Docker host?

**Strong answer:** The harness is scoped to a local labeled Compose project. A remote
daemon makes the blast radius and ownership of targets uncertain. Refusal is safer than
assuming similar names mean the intended environment.

**Go deeper:** What additional controls would be required before remote execution could be
considered?

### 27. Why require both Compose identity and a chaos-target label?

**Strong answer:** Names can collide and manual containers can resemble project services.
Project/service resolution plus an explicit opt-in label forms a stronger allowlist and
makes accidental mutation of unrelated containers less likely.

**Go deeper:** What should the runner do if either signal is missing?

### 28. Why register revert before applying a fault?

**Strong answer:** Once mutation begins, any later instruction can throw or be interrupted.
Registering cleanup first ensures the finally path already knows how to reverse the exact
operation. Reverts should also be idempotent so partial cleanup is safe to repeat.

**Go deeper:** Describe the revert for a pause, a SIGKILL/restart, and a toxic.

### 29. Why serialize experiments with a lock?

**Strong answer:** Concurrent injectors can invalidate attribution, race over service
state, remove each other's toxics, and corrupt cleanup assumptions. One lock makes the
active fault and its evidence unambiguous.

**Go deeper:** What state would a distributed lock need if matrices ran on multiple hosts?

### 30. Why are error-rate aborts and hard deadlines different?

**Strong answer:** An error-rate abort limits harm when the observed workload degrades
too far. A hard deadline guarantees termination when progress signals or cleanup logic
stall. One is a domain safety threshold; the other is a control-flow backstop.

**Go deeper:** Which evidence should be written before aborting?

## Observability and the controller

### 31. What does MAPE-K mean in this project?

**Strong answer:** Monitor collects metrics and independent state; Analyze validates and
classifies evidence; Plan chooses a bounded action or no action; Execute applies that
action through the safety layer; Knowledge contains thresholds, history, policies, and
response events. The phases are explicit so decisions are auditable.

**Go deeper:** Point out where hysteresis or cooldown belongs.

### 32. Why is the controller itself under test?

**Strong answer:** A bad remediation can be more damaging than the original fault.
Telemetry can disappear or lie, counters can reset, and a healthy service can look bad
through a broken proxy. Controller decisions therefore need validation, independent
corroboration, and zero-action evidence for sensor faults.

**Go deeper:** What is the difference between guarded mode and blind mode?

### 33. How does the project handle missing telemetry?

**Strong answer:** Missing required series or an unavailable metrics source enters blind
mode. The controller records that it cannot support a metric-driven decision and uses
independent Docker state only for bounded corroboration, rather than inventing values or
restarting on absence alone.

**Go deeper:** Why is treating missing data as zero dangerous?

### 34. How does it handle invalid or stale telemetry?

**Strong answer:** It rejects non-finite/out-of-range values, stale source timestamps,
integrity-canary mismatches, and impossible counter behavior. Invalid evidence enters a
guarded state and suppresses unsafe action while preserving the reason in response
events.

**Go deeper:** Distinguish an application counter reset from fabricated counter corruption.

### 35. What prevents a sensor spike from causing a false restart?

**Strong answer:** Metric validation, temporal policy, and independent Docker-state
corroboration prevent a single bad sample from authorizing action. FS-2 repeated evidence
tests that the controller records the anomaly but performs zero false actions.

**Go deeper:** When might Docker state also be insufficient?

### 36. What are MTTD and MTTR here?

**Strong answer:** MTTD is time from fault injection to an explicit
`anomaly_detected` response event. MTTR is time from that detection to recovery. If the
required response event is absent, the metric is null and counted as missing; runner
phase timestamps are not substituted.

**Go deeper:** Why can application availability recovery precede full correctness
verification?

## Repetition, statistics, and conclusions

### 37. Why is one successful run insufficient?

**Strong answer:** Asynchronous systems depend on timing, scheduling, retries, and queue
state. One run may miss the vulnerable window. Repeated seeded runs with varied offsets
test whether behavior is stable while preserving enough determinism to investigate.

**Go deeper:** What does the seed control, and what must remain unique per run?

### 38. Why report median and p90 together?

**Strong answer:** Median represents typical behavior; p90 exposes slower tail recovery.
Min/max help spot extremes, while sample and missing counts prevent sparse evidence from
looking complete. The report uses a stated nearest-rank p90 definition.

**Go deeper:** Why should a missing sample not become zero milliseconds?

### 39. What does 130/130 matrix completion prove—and not prove?

**Strong answer:** It proves that the declared local scenarios completed with their stated
policies and artifacts in that environment. It does not prove production-scale
reliability, independence across infrastructure, absence of all defects, or generality
beyond the tested workload and fault model.

**Go deeper:** Name three external-validity limitations.

### 40. How would you interpret zero false actions in FS-2?

**Strong answer:** Within the 50 recorded FS-2 assessments, the controller did not mutate
services in response to the injected sensor corruption. That supports the guard policy;
it is not a universal probability claim and must stay tied to those run IDs and configs.

**Go deeper:** What additional corruption patterns would strengthen the conclusion?

## Debugging and extension

### 41. A run fails I5. What is your debugging order?

**Strong answer:** Confirm run scope and config; compare client journal to payments and
outbox rows; inspect relay state and age; inspect BullMQ job/retry/dead-letter state;
inspect sink deliveries; align those with the event timeline; then confirm cleanup. Do not
rerun first and erase the opportunity to explain the existing artifact.

**Go deeper:** How do you distinguish publication loss from delayed stalled-job recovery?

### 42. The API is healthy but requests time out. What do you inspect?

**Strong answer:** Separate container/process health from dependency-path health. Inspect
the specific proxy toxic, application latency/error metrics, database/Redis connectivity,
client journal ambiguity, and controller response events. Then reconcile timed-out keys
against durable payments before retrying.

**Go deeper:** Why can a timeout be a successful commit from the server's perspective?

### 43. How would you add a new fault safely?

**Strong answer:** Define the hypothesis and expected invariant impact; add a narrowly
validated schema; identify an explicitly allowed target; implement apply and idempotent
revert; add preflight, deadline, and abort behavior; emit typed timeline events; test
success, rejection, interruption, and cleanup; document the experiment; run a control
before claiming a finding.

**Go deeper:** Which parts belong in the generic runner versus the fault strategy?

### 44. How would you add a new invariant?

**Strong answer:** Write the human contract first, choose an authoritative source, define
scope and timing, define pass/fail/report semantics, create positive and synthetic
negative fixtures, integrate immutable output into run reports, and explain interactions
with existing invariants.

**Go deeper:** What makes an invariant flaky, and how would you remove that flakiness?

### 45. What would you change before production use?

**Strong answer:** Replace local-host assumptions with authenticated orchestration and
stronger environment allowlists; isolate credentials; add resource budgets and approvals;
use production-grade telemetry/storage; harden relay leasing; validate against realistic
scale and multi-node failure; and integrate evidence retention and incident ownership.
The current repository is an evidence-backed portfolio harness, not a production chaos
platform.

**Go deeper:** Which change improves safety first, and which improves experimental validity
first?

### 46. What is the most important design lesson?

**Strong answer:** Failure injection is easy compared with proving causality and
correctness. Durable identity, authoritative state, explicit event timing, run isolation,
safe cleanup, and honest missing-data semantics are what turn a container-killing demo
into an engineering experiment.

**Go deeper:** Defend that statement using F-001 and F-002.

## Self-evaluation rule

Score each answer from 0 to 3:

- **0:** cannot explain it;
- **1:** can repeat the conclusion but not the mechanism;
- **2:** can explain mechanism and tradeoff;
- **3:** can also locate implementation/evidence and handle the follow-up.

Do not call a topic owned until it scores 3 twice on different days without reading the
answer first.
