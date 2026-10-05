# Experiment runner

The runner validates YAML with Zod, prevents concurrent experiments with a repository
lock, creates a unique artifact directory, and executes:

`preflight → baseline → inject → observe → revert → recovery wait → verify → report`

`revert` is in a `finally` path and is unit-tested to run when observation fails. Each
successful run preserves the validated config, phase timeline, Prometheus baseline,
load journal and summary, invariant output, response event stream, response timing, and
final JSON report.

Preflight also requires the outbox relay's port-3004 readiness endpoint so an experiment
does not begin when durable publication is already unavailable.

`fault: none` and FS-1 through FS-4 are executable. FS-1 supports kill, stop, pause, and
restart behind the Docker safety layer. FS-2 uses the authenticated metrics-proxy
control surface for spike, drop, freeze, noise, and counter-reset modes and always
registers `mode: none` cleanup before mutation. FS-3 can stop only the labeled metrics
proxy and requires proxy-backed Prometheus targets to recover. FS-4 accepts only the
three statically configured Toxiproxy paths and supports latency with jitter, timeout,
and reset-peer toxics.

Experiments may set `duplicate_observation_s` independently of
`invariant_drain_timeout_s`. The former watches for delayed duplicate transport events;
the latter waits for every committed payment to reach delivery or dead letter. Generated
idempotency keys include the unique load run ID, so repeated seeds reproduce workload
shape without reusing persisted payment identity across runs.

Response events use a versioned Zod schema and an append-only JSONL file. MTTD and MTTR
are computed only from actual boundary events. The standalone `response.json` is written
for successful and failed runs; missing controller events remain `null`.

Controller-enabled FS-1 worker experiments may set
`controller.restart_during_outage: true`. The runner stops its controller child before
the worker fault, confirms Docker reports the worker down, starts a replacement
controller, and records `controller_restart_started` and `controller_restarted`. The
run passes this scenario only when `controller-restart-assessment.json` also shows a
successful controller recovery action and final recovery after restart began.

Run the control experiment:

```powershell
npm run start --workspace @chaos/runner -- experiments/control.yml
```

Run the complete repeated matrix:

```powershell
npm run matrix -- --dry-run experiments/day17-matrix.yml
npm run matrix -- experiments/day17-matrix.yml
```

Run the Day 18 gap matrix:

```powershell
npm run matrix -- --dry-run experiments/day18-gap-matrix.yml
npm run matrix -- experiments/day18-gap-matrix.yml
```

The matrix manifest enforces at least ten repeats per listed experiment, varies seeds
and deterministic bounded injection offsets, and requires control plus FS-1 through
FS-4 coverage. A readiness barrier prevents a restarted service from contaminating the
next repeat; it includes the API, outbox relay, metrics proxy, sink, and Prometheus.
Aggregate JSON and Markdown are written under
`docs/results/matrices/<matrix-run-id>/`; null timings remain missing rather than zero.

## Verified control

Run `no-fault-control-2026-10-04T03-24-48-758Z-3b023a1f` completed every lifecycle
phase. Its seeded load run scheduled 56 operations; all 56 succeeded, including three
idempotent replays. I1–I6 all passed, with I6 using the stricter no-fault failure policy.
The complete evidence is under `docs/results/experiments/<run-id>/`.

## Verified response tracking

FS-1 run `kill-worker-mid-batch-2026-10-04T04-19-35-332Z-791c2def` recorded fault and
recovery events and calculated an unhealed MTTR of 6,939 ms. It intentionally reports
MTTD as `null` because no controller emitted `anomaly_detected`. All 394 load operations
succeeded and I1–I6 passed.

## Verified network faults

FS-4 run `postgres-latency-retry-2026-10-04T04-46-57-637Z-c333a74c` added 750 ms of
downstream PostgreSQL latency with 100 ms jitter. Only 31/105 scheduled operations
succeeded and client p95 reached 2,013 ms. All invariants passed for the acknowledged
payments, but this was a severe availability degradation, not a resilience success.

Run `sink-timeout-retry-2026-10-04T04-47-36-937Z-734ec032` completed 120/120 operations.
I1–I5 passed and I6 reported 24 duplicate event IDs, each delivered twice. Those are
expected transport duplicates under an injected timeout; no duplicate financial effect
was observed. Both runs automatically removed their toxic before recovery verification.

## Verified sensor disruption

FS-3 run `sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8` stopped and
restored the metrics proxy. The controller emitted one blind-mode alert and a restoration
event, with no anomaly, plan, or action event. The workload completed 214/214 operations
and I1-I6 passed. Recovery was not declared until both proxy-backed scrape jobs returned.

## Verified corrupt telemetry

Five FS-2 runs exercised spike, dropped series, frozen/stale values, non-finite noise,
and unexplained counter resets. Each run preserved `fs2-assessment.json`, detected the
intended corruption after its own fault timestamp, observed the worker healthy
throughout, measured zero false actions, restored valid telemetry, completed every load
operation, and passed I1-I6. Exact run IDs are in `docs/fs2.md`.

## Verified multi-run matrix

Matrix `day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` completed all 130 planned
runs across the 13 implemented configurations. It preserved 128 passing reports and two
I5 failures that reproduce known F-001. The aggregate contains median, nearest-rank p90,
min, max, missing timing counts, invariant pass/non-failure rates, and every source run
ID. See `docs/matrix.md` for the measured results and interpretation.

## Verified Day 18 bug-hunt gaps

Matrix `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6` completed 30/30 runs with
no failed report: ten Redis stops at 100 requests/second, ten controller restarts during
verified worker outages at 50 requests/second, and ten 750 ms PostgreSQL-latency runs at
50 requests/second. I1-I6 passed in every run. All ten controller restart assessments
passed. The latency and Redis scenarios produced substantial client failures, but no
correctness invariant failed, so they are degradations rather than new findings.
