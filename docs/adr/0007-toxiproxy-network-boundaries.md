# ADR-0007: Static Toxiproxy network boundaries

- Status: accepted
- Date: 2026-10-04

## Context

FS-4 needs repeatable network degradation without granting the experiment runner a
general-purpose network mutation surface. The managed services have three useful
dependency paths: API-to-PostgreSQL, API-to-Redis, and worker-to-webhook-sink.

## Decision

Docker Compose declares one named Toxiproxy proxy for each path. Managed services always
use those proxy endpoints, including outside an experiment, so injection changes only a
toxic and never rewires a running container. The runner schema allowlists the three proxy
names and the latency, timeout, and reset-peer toxic types.

Before adding a toxic, the runner registers its exact removal in the existing LIFO
cleanup stack. Names include the experiment run ID, removal treats an absent toxic as
success, and recovery verification begins only after cleanup. Dry-run verifies the
configured proxy through the Toxiproxy API and performs no mutation.

Toxiproxy works at the TCP stream level. This project therefore supports latency with
jitter, stream timeout, and connection reset, but does not present those modes as true
packet loss.

## Consequences

Experiments have stable, auditable fault boundaries and can recover after failures or
interrupts without dynamically modifying service configuration. Toxiproxy becomes a
required local dependency for the API and worker paths. A stopped proxy is itself an
availability failure, and packet-level experiments would require a different tool.
