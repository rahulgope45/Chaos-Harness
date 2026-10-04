# Chaos Harness

A local chaos-engineering harness for testing both recovery behavior and data
correctness in a sample payment system. The managed payment services and the
rule-based MAPE-K controller are kept structurally separate.

## Status

Active development. The managed payment stack, reproducible load generator, I1–I6
checker, no-fault experiment runner, and Docker safety boundary are implemented. A/A
controls pass; fault injection remains disabled until each injector is implemented
behind that boundary. Defect claims will only be added after reproducible fault runs
produce evidence artifacts and run IDs.

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
