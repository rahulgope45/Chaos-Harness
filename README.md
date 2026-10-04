# Chaos Harness

A local chaos-engineering harness for testing both recovery behavior and data
correctness in a sample payment system. The managed payment services and the
rule-based MAPE-K controller are kept structurally separate.

## Status

Active development. The managed payment stack, reproducible load generator, I1–I6
checker, no-fault experiment runner, Docker safety boundary, FS-1, and response tracker
and rule-based controller are implemented. FS-4 provides allowlisted Toxiproxy network
faults on the API-to-PostgreSQL, API-to-Redis, and worker-to-sink paths. A/A controls
pass; only implemented injectors are enabled behind the safety boundary. Defect claims
are added only after reproducible fault runs produce evidence artifacts and run IDs.

Controller run `kill-worker-with-controller-2026-10-04T04-38-33-079Z-6548b9dd`
detected a killed worker in 733 ms, selected and verified a restart, completed 281/281
operations, and passed I1–I6. This is one functional run, not an aggregate performance
claim.

FS-1 is now implemented. Run
`kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248` confirmed the first genuine
defect: four committed payments lost their webhook event because database commit and
queue enqueue are not atomic. See
`docs/findings/F-001-commit-before-enqueue-event-loss.md`.

The worker crash-after-webhook experiment reported four expected at-least-once transport
duplicates while I1 and I2 remained clean. During that investigation the harness itself
revealed and fixed genuine finding F-002: repeated seeds reused persisted idempotency
keys and could contaminate evidence across runs. See
`docs/findings/F-002-cross-run-evidence-contamination.md`.

FS-4 evidence includes a PostgreSQL latency run that exposed major client-visible
degradation without corrupting acknowledged payments, and a sink-timeout run that
produced expected transport duplicates without duplicate financial effects. See
`docs/fs4.md`.

## Handover

- [Project introduction](docs/handover/00-project-introduction.md)
- [Current startup runbook](docs/handover/01-current-startup-runbook.md)
- [Day-by-day implementation](docs/handover/02-day-by-day-implementation.md)
- [Study guide and debugging map](docs/handover/03-study-guide.md)

One intentionally fabricated case is kept separately as synthetic scenario S-001. It
models a non-idempotent webhook consumer duplicating an email side effect and is never
presented as a discovered defect. See
`docs/synthetic/S-001-non-idempotent-webhook-consumer.md`.

## Local infrastructure

1. Copy `.env.example` to `.env` if you need to override the safe local defaults.
2. Run `docker compose up -d`.
3. Run `docker compose ps` and confirm every service is healthy.
4. Open Prometheus at <http://127.0.0.1:19090>.

All published ports bind to `127.0.0.1`. Only containers labeled
`chaos-target=true` may be attacked by the future experiment runner.

## Quality checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
```

## Scope

Version 1 targets Docker Compose on the local machine. It does not claim
production readiness, Kubernetes support, true packet-loss injection, or safe
operation against remote Docker hosts.
