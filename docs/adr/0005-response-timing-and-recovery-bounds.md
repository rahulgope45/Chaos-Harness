# ADR-0005: Response timing and recovery bounds

- Status: accepted
- Date: 2026-10-04

## Context

MTTD and MTTR are only meaningful when their boundary events have explicit timestamps.
Inferring detection from a runner phase would make the future controller appear faster
than it really is. Recovery also needs a stable definition so a single healthy sample
does not end an experiment prematurely.

## Decision

The runner and controller exchange versioned response events through an append-only
JSONL stream. The event vocabulary is `fault_injected`, `anomaly_detected`,
`plan_selected`, `action_executed`, and `recovered`. Producers identify themselves as
`runner` or `controller`; neither calls the other's implementation.

- MTTD is `anomaly_detected.at - fault_injected.at`.
- MTTR is `recovered.at - fault_injected.at`.
- A missing boundary event produces `null`, never an inferred value.
- Negative durations and mixed run IDs are rejected.

The experiment's `steady_state.max_error_rate` is selected after observing baseline
runs and is preserved in its YAML. At runtime the effective recovery bound is the
greater of that declared budget and the immediately measured pre-fault baseline error
rate, so recovery is never required to outperform the starting state. Recovery requires
`recovery.consecutive_healthy` observations at one-second intervals. The report records
the effective bound, count, and sampling interval with the timing result.

## Consequences

Unhealed experiments can measure MTTR but correctly have no MTTD until a controller
emits a detection event. Day 13 can add controller events without coupling controller
logic to the runner. Day 17 can aggregate the same versioned per-run schema.
