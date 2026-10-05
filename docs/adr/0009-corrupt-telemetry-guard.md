# ADR-0009: Guard corrupt telemetry with independent corroboration

- Status: accepted
- Date: 2026-10-05

## Context

Telemetry can be present and still be unsafe. A scrape may contain dropped series,
impossible spikes, frozen values, non-finite noise, or a counter reset that is not
explained by an application restart. A controller that treats every present sample as
truth can turn a sensor defect into an unnecessary restart.

## Decision

The metrics proxy exposes authenticated, allowlisted FS-2 modes for local experiments.
It also adds three integrity canaries to each scrape: source timestamp, monotonic proxy
scrape counter, and a fixed integrity value. The worker job is checked for those
canaries plus queue depth and completed-job count.

The controller rejects telemetry when a required series is missing, a value is
non-finite or outside its safety bound, the source timestamp is stale, or a newer sample
contains an unexplained counter decrease. It emits one transition-based
`telemetry_invalid` event, stays in guarded mode, and continues to use independently
observed Docker state for the current restart policy. Valid data after revert emits
`telemetry_validated`.

FS-2 never mutates an application container. The runner verifies valid telemetry before
injection, registers `mode: none` cleanup before mutation, monitors the worker's Docker
state during load, and records a false-action count. An FS-2 run passes only when the
intended corruption is detected, telemetry validates after revert, the worker remains
healthy, no controller action occurs, and I1-I6 pass.

## Consequences

Missing data and corrupt data are separate controller states with separate evidence.
The current destructive policy remains grounded in Docker state, so corrupt Prometheus
samples alone cannot restart a healthy worker. The integrity canaries make freeze and
counter-reset tests deterministic without claiming that the injected data is a genuine
product defect. Bounds are deliberately conservative safety limits, not learned
production thresholds.
