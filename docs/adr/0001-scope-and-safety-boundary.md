# ADR-0001: Scope and safety boundary

- Status: accepted
- Date: 2026-10-04

## Context

The harness deliberately disrupts services. An incorrect target or remote Docker
connection could affect unrelated workloads.

## Decision

Version 1 runs only against a local Docker Compose stack. Fault actions require
the target container to carry `chaos-target=true`. The runner will reject remote
Docker hosts, enforce one active experiment, cap experiment duration, watch an
error-rate abort threshold, and revert active faults on completion, failure,
SIGINT, or SIGTERM.

PostgreSQL is not an allowed target until the explicit bug-hunt phase. Kubernetes,
cloud infrastructure, production systems, and real payment integrations are out
of scope.

## Consequences

The system is safer to demonstrate locally, at the cost of not claiming general
production or orchestration-platform support. Access to the Docker daemon remains
high privilege and must be documented wherever the harness is run.
