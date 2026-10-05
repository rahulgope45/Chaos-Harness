# Rule-based MAPE-K controller

`harness/controller` implements a minimal rule-based control loop:

- Monitor: proxy-backed Prometheus availability and integrity plus Docker inspect for
  each enabled policy target.
- Analyze: immutable policy evaluation with consecutive-breach hysteresis.
- Plan: a PostgreSQL policy chooses restart, subject to cooldown and restart-window
  limits.
- Execute: Docker restart followed by a running-state verification.
- Knowledge: versioned `controller_policies` rows, reloaded every cycle.

The controller repeats the runner's safety boundary: local Docker only, the
`chaos-harness` Compose project only, and `chaos-target=true` only. It exposes
`/healthz` and `/metrics` on a local port. Metrics include cycle duration, action counts,
blocked actions, and target running state.

Missing/down proxy-backed telemetry puts the controller into blind mode. It emits a
single transition alert, takes no action based on the missing metrics, and uses Docker
state as the independent fallback for the current restart policy. Metrics include
telemetry availability and blind-mode transition count.

Present telemetry is also validated for required series, finite values, conservative
bounds, source freshness, and monotonic counters on newer Prometheus samples. Invalid
data enters guarded mode, emits one `telemetry_invalid` transition, and continues to use
Docker state as the independent authority for the current restart policy. Valid samples
after cleanup emit `telemetry_validated`. Metrics expose both availability and validity.

Controller-enabled experiments launch it as a separate Node process. It writes
`anomaly_detected`, `plan_selected`, `action_executed`, `telemetry_unavailable`,
`telemetry_restored`, `telemetry_invalid`, and `telemetry_validated` to the same
validated JSONL protocol that the runner reads; there are no direct process calls
between their control loops.

For the Day 18 lifecycle test, the runner can deliberately replace its controller child
while the worker is down. This is process orchestration, not a controller self-restart:
the runner stops the first controller, kills and verifies the worker outage, launches a
new controller, and then observes the ordinary MAPE-K response through the shared event
protocol. A dedicated assessment rejects runs that merely restarted a process without
recovering the already-failed target.

## Verified experiment

Run `kill-worker-with-controller-2026-10-04T04-38-33-079Z-6548b9dd` killed the payment
worker under a 30 requests/second workload. The persisted policy detected the outage on
its second observation and restarted the worker.

| Measurement             |             Result |
| ----------------------- | -----------------: |
| MTTD                    |             733 ms |
| Detection to plan       |               5 ms |
| Plan to verified action |             478 ms |
| MTTR                    |           8,581 ms |
| Load operations         | 281/281 successful |
| Invariants              |       I1–I6 passed |

This remains the first functional proof. Day 17 matrix
`day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` repeated the same
controller-enabled scenario ten times. MTTD median/p90/min/max was
632/872/615/1,004 ms; MTTR was 8,649/9,021/7,777/9,491 ms. All ten reports passed I1-I6.

Day 18 matrix `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6` repeated the
controller-replacement scenario ten times. Every run observed the worker down before
starting the replacement controller, recorded a successful post-restart recovery action,
passed its controller restart assessment, and passed I1-I6. MTTD median/p90/min/max was
1,871/3,420/1,726/3,745 ms; MTTR was 8,798.5/9,233/8,285/9,408 ms.

## Verified blind mode

FS-3 run `sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8` stopped the
metrics proxy while the payment services remained healthy. The controller emitted
`telemetry_unavailable` and later `telemetry_restored`, but emitted no application
anomaly, plan, or action. The run completed 214/214 operations with I1-I6 passing.

## Verified corrupt-telemetry guard

The five Day 16 FS-2 runs detected bounds, required-series, freshness, finite-value, and
monotonicity violations respectively. In every run the independently observed worker
remained healthy, the controller emitted no plan/action, and `false_action_count` was
zero. All scheduled load operations and I1-I6 passed. See `docs/fs2.md` for run IDs and
mode-by-mode evidence.
