# ADR-0006: PostgreSQL-backed controller policies

- Status: accepted
- Date: 2026-10-04

## Context

The controller must not hide recovery thresholds or restart behavior in application
constants. Policies need operational controls for noisy observations and restart storms,
and changes should take effect without rebuilding or restarting the controller.

## Decision

Versioned policy rows live in PostgreSQL. Every MAPE-K cycle reloads enabled rows and
validates them before use. A version change resets that policy's in-memory hysteresis
state. The initial policy targets `payment-worker` and contains:

- two consecutive `container_not_running` observations before detection;
- a five-second cooldown;
- at most three restart attempts per sixty-second window;
- a 500 ms observation interval;
- a single `restart` action.

PostgreSQL checks reject unsupported conditions/actions and invalid limits. The execute
stage independently repeats the local-Docker, Compose-project, and `chaos-target=true`
checks before restarting and then verifies the container is running.

The runner may launch the controller as a separate process for an experiment. Their
only runtime coordination is the versioned response-event JSONL stream. Standby-worker
scaling remains explicitly out of scope as a cuttable stretch item.

## Consequences

Policies are auditable and hot-reloaded, while short-lived counters remain local to the
controller process. A future multi-controller design would need durable or coordinated
policy state; v1 runs exactly one controller.
