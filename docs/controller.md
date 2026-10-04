# Rule-based MAPE-K controller

`harness/controller` implements a minimal rule-based control loop:

- Monitor: proxy-backed Prometheus scrape availability plus Docker inspect for each
  enabled policy target.
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

Controller-enabled experiments launch it as a separate Node process. It writes
`anomaly_detected`, `plan_selected`, `action_executed`, `telemetry_unavailable`, and
`telemetry_restored` to the same validated JSONL protocol that the runner reads; there
are no direct process calls between their control loops.

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

This is a single functional proof, not an aggregate latency claim. Day 17 will require
N≥10 runs before reporting median or p90 controller performance.

## Verified blind mode

FS-3 run `sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8` stopped the
metrics proxy while the payment services remained healthy. The controller emitted
`telemetry_unavailable` and later `telemetry_restored`, but emitted no application
anomaly, plan, or action. The run completed 214/214 operations with I1-I6 passing.
