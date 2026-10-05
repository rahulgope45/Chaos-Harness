# ADR-0008: Telemetry blind mode

- Status: accepted
- Date: 2026-10-04

## Context

Missing telemetry is ambiguous. It can mean the application failed, the metrics endpoint
failed, the proxy failed, Prometheus failed, or the network path failed. Treating absent
metrics as proof that an application is unhealthy can make the controller restart a
healthy service and amplify a sensor outage.

## Decision

Prometheus scrapes the payment API and worker only through the pass-through
`metrics-proxy` sensor. The controller separately queries the proxy-backed `up` series
and enters blind mode when either required target is absent or down.

On the transition into blind mode, the controller emits one validated
`telemetry_unavailable` alert with the missing jobs and records a metric. It performs no
destructive action based on absent telemetry. Current restart policies continue to use
independently observed Docker state, so a genuinely stopped worker may still be restored
while a healthy worker is left untouched. When both scrape targets return, the
controller emits `telemetry_restored` and exits blind mode.

FS-3 is restricted to stopping the local, labeled `metrics-proxy`. The runner verifies
that proxy-backed telemetry is healthy before injection and requires it to return before
declaring experiment recovery.

## Consequences

Sensor loss becomes an explicit controller state rather than an application-failure
signal. Alert events are transition-based, so a long outage does not flood the event
stream. Docker is an intentional independent fallback for the current container-running
policy. Blind mode alone does not detect plausible but corrupted values; ADR-0009
defines and verifies the additional present-data guard.
