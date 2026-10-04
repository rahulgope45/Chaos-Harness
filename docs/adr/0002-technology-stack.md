# ADR-0002: Technology stack

- Status: accepted
- Date: 2026-10-04

## Context

The project needs a reproducible managed payment service and an independently
structured chaos/control harness that one developer can operate locally.

## Decision

Use strict TypeScript on Node.js 24 in an npm-workspaces monorepo. Use Express for
HTTP services, PostgreSQL through Prisma 7 with the `@prisma/adapter-pg` driver,
Redis and BullMQ for queued work, Prometheus for metrics, Toxiproxy for TCP-level
faults, and Docker Compose for local orchestration.

The repository is ESM with NodeNext resolution. Shared source packages do not
have a separate build step; deployable services will compile into container
images. Database invariants live in PostgreSQL constraints and triggers rather
than only in application code.

## Consequences

The entire demonstration remains local and free to run. Toxiproxy can model
latency, jitter, timeout, and connection resets, but not true packet loss. Prisma
is a query and schema tool, not the authority for financial integrity.
