# ADR-0011: Day 18 bug-hunt scope and PostgreSQL target boundary

- Status: accepted
- Date: 2026-10-05

## Context

The Day 18 plan asks for peak worker and API failures, Redis loss, PostgreSQL latency,
controller restart during an outage, and optionally making PostgreSQL a direct chaos
target. The repository already had ten-run Day 17 evidence for worker/API failures and
two genuine findings. The remaining scenarios needed real repeated evidence, but adding
`chaos-target=true` to PostgreSQL would widen the mutation boundary around the shared
source of truth, sink evidence, and controller policy store.

## Decision

Complete the bug hunt with a ten-repeat gap matrix for Redis stop, controller replacement
during an observed worker outage, and peak API-to-PostgreSQL latency. Keep PostgreSQL
outside the direct Docker mutation allowlist.

The controller-restart scenario is accepted only when its event stream proves this
ordering: worker fault, worker observed down, replacement controller started, successful
controller recovery action, and final recovery. Every run writes a dedicated assessment.

Use the existing API-to-PostgreSQL Toxiproxy boundary for database-path disruption. It
isolates the dependency seen by the API, has run-scoped cleanup, and preserves access to
the database for the sink, controller, and invariant checker. Direct database-container
failure may be revisited only with an isolated ephemeral database/reset strategy and an
explicitly widened safety review.

## Consequences

- Day 18 adds genuine repeated evidence without manufacturing another defect.
- PostgreSQL latency can expose availability degradation while invariant verification
  remains available after toxic cleanup.
- The source-of-truth container and its persistent volume are not added to the mutation
  allowlist merely to satisfy a checklist item.
- The limitation is explicit: this project does not claim evidence for full PostgreSQL
  process loss or primary failover.
