# Current startup runbook

This runbook covers only components that exist in the repository now. It does not
describe the planned metrics proxy, FS-2/FS-3 injectors, aggregate report generator,
transactional outbox, or any other future component.

Commands assume Windows PowerShell from `E:\Projects\chaos-harness`.

## Prerequisites

- Docker Desktop running with the Linux container engine.
- Node.js 24; the repository pins the major version in `.nvmrc`.
- npm 12 or a compatible npm version.
- Ports 3000, 3001, 3002, 5432, 6380, 8474, 8666-8670, and 19090 available.

Check the tools:

```powershell
node --version
npm --version
docker version
docker compose version
```

## First startup from a fresh clone

### 1. Install dependencies and create local configuration

```powershell
Set-Location E:\Projects\chaos-harness
npm ci
Copy-Item .env.example .env
```

The checked-in defaults are local development credentials. Change `.env` if those ports
or credentials conflict with another local project.

### 2. Start the infrastructure dependencies

```powershell
docker compose up -d postgres redis prometheus toxiproxy
docker compose ps
```

Wait until all four show `healthy` before applying migrations.

### 3. Generate the Prisma client and apply migrations

```powershell
$env:DATABASE_URL='postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness'
npm run generate --workspace @chaos/database
npm run migrate:deploy --workspace @chaos/database
```

`migrate:deploy` is safe to run again; it applies only migrations not already recorded.
The current migrations create the payment/ledger schema, webhook deliveries, and seeded
controller policy.

### 4. Build and start the complete managed stack

```powershell
docker compose up --build -d
docker compose ps
```

The expected result is seven running, healthy services.

## Current components

| Component         | How it runs                                | Local endpoint or port                    | Purpose                                                    |
| ----------------- | ------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------- |
| PostgreSQL        | Compose `postgres`                         | `127.0.0.1:5432`                          | Source of truth, ledger, sink records, controller policies |
| Redis             | Compose `redis`                            | `127.0.0.1:6380`                          | API fast path and BullMQ storage                           |
| Prometheus        | Compose `prometheus`                       | `http://127.0.0.1:19090`                  | Metrics scraping and recording rules                       |
| Toxiproxy         | Compose `toxiproxy`                        | API at `http://127.0.0.1:8474`            | FS-4 dependency-path faults                                |
| Webhook sink      | Compose `webhook-sink`                     | `http://127.0.0.1:3002`                   | Persists attempted webhook deliveries                      |
| Payment worker    | Compose `payment-worker`                   | health/metrics at `http://127.0.0.1:3001` | BullMQ processing, retry, and dead letter                  |
| Payment API       | Compose `payment-api`                      | `http://127.0.0.1:3000`                   | Idempotent payment creation and lookup                     |
| Controller        | Host Node process, usually runner-launched | `http://127.0.0.1:3100`                   | Rule-based worker recovery                                 |
| Load generator    | Host CLI                                   | no server                                 | Seeded open-loop payment traffic                           |
| Invariant checker | Host CLI                                   | no server                                 | I1-I6 verification                                         |
| Experiment runner | Host CLI                                   | no server                                 | Orchestrates complete experiments                          |

## Start or restart individual Compose components

Compose starts declared dependencies automatically. Use `--build` for the three custom
Node service images after source changes.

```powershell
docker compose up -d postgres
docker compose up -d redis
docker compose up -d prometheus
docker compose up -d toxiproxy
docker compose up --build -d webhook-sink
docker compose up --build -d payment-worker
docker compose up --build -d payment-api
```

To rebuild all custom services after code changes:

```powershell
docker compose up --build -d payment-api payment-worker webhook-sink
```

## Verify the running stack

```powershell
docker compose ps
Invoke-RestMethod http://127.0.0.1:3000/healthz
Invoke-RestMethod http://127.0.0.1:3000/readyz
Invoke-RestMethod http://127.0.0.1:3001/healthz
Invoke-RestMethod http://127.0.0.1:3002/healthz
curl.exe -sS http://127.0.0.1:8474/proxies
```

The Toxiproxy response should list `api-postgres`, `api-redis`, and `worker-sink`; each
should have an empty `toxics` array outside an active FS-4 experiment.

Prometheus checks:

- Health: `http://127.0.0.1:19090/-/healthy`
- Targets: `http://127.0.0.1:19090/targets`
- API metrics: `http://127.0.0.1:3000/metrics`
- Worker metrics: `http://127.0.0.1:3001/metrics`

## Send one smoke payment

```powershell
$smokeKey = "handover-$([guid]::NewGuid())"
$headers = @{ 'Idempotency-Key' = $smokeKey }
$body = @{ amount_minor = 1250; currency = 'USD' } | ConvertTo-Json
$payment = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/payments -Headers $headers -ContentType 'application/json' -Body $body
$payment
Invoke-RestMethod "http://127.0.0.1:3000/payments/$($payment.id)"
```

A new request returns 201. Repeating the same key and body returns the original payment;
the same key with a different body returns 422.

## Run the current harness components

### Quality and test suites

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:integration
```

Integration tests require the PostgreSQL and Redis containers.

### Standalone load generator

```powershell
$env:LOADGEN_SEED='42'
$env:LOADGEN_DURATION_SECONDS='10'
$env:LOADGEN_RATE_PER_SECOND='10'
npm run start --workspace @chaos/loadgen
```

Artifacts are written under `docs/results/baseline/` unless
`LOADGEN_OUTPUT_ROOT` is set.

### Standalone invariant checker

Point it to an actual journal created by the load generator or runner:

```powershell
$env:INVARIANT_JOURNAL='docs/results/baseline/<run-id>/journal.jsonl'
$env:INVARIANT_OUTPUT='docs/results/invariants/<run-id>.json'
$env:INVARIANT_DRAIN_TIMEOUT_MS='30000'
npm run start --workspace @chaos/invariants
```

For a fault run, set `INVARIANT_FAULT_INJECTED=true`. I6 then defaults to report-only
for transport duplicates; I1-I5 remain hard checks.

### Explicit synthetic scenario

```powershell
npm run synthetic:s001 --workspace @chaos/invariants
```

This demonstrates a deliberately non-idempotent consumer. It is never a genuine finding.

### No-fault control experiment

Always use the control before trusting a changed harness:

```powershell
npm run start --workspace @chaos/runner -- experiments/control.yml --dry-run
npm run start --workspace @chaos/runner -- experiments/control.yml
```

### Current FS-1 experiments

```powershell
npm run start --workspace @chaos/runner -- experiments/kill-worker-mid-batch.yml --dry-run
npm run start --workspace @chaos/runner -- experiments/kill-worker-mid-batch.yml
npm run start --workspace @chaos/runner -- experiments/kill-api-after-commit.yml
npm run start --workspace @chaos/runner -- experiments/kill-worker-after-side-effect.yml
```

These commands intentionally stop or kill local labeled containers. Read the YAML before
running and verify cleanup with `docker compose ps` afterward.

### Controller-enabled experiment

```powershell
npm run start --workspace @chaos/runner -- experiments/kill-worker-with-controller.yml
```

The runner starts and stops the controller process and shares only the response-event
JSONL file with it.

To run the controller manually in its own terminal:

```powershell
$env:DATABASE_URL='postgresql://chaos:chaos@127.0.0.1:5432/chaos_harness'
$env:CONTROLLER_PORT='3100'
npm run start --workspace @chaos/controller
```

Stop a manual controller with Ctrl+C. Do not run a manual controller at the same time as
a controller-enabled experiment unless you intentionally want two control loops.

### Current FS-4 experiments

```powershell
npm run start --workspace @chaos/runner -- experiments/postgres-latency-retry.yml --dry-run
npm run start --workspace @chaos/runner -- experiments/postgres-latency-retry.yml
npm run start --workspace @chaos/runner -- experiments/sink-timeout-retry.yml
```

Afterward, confirm all `toxics` arrays are empty:

```powershell
curl.exe -sS http://127.0.0.1:8474/proxies
```

## Logs and fast diagnosis

```powershell
docker compose logs --tail 100 payment-api
docker compose logs --tail 100 payment-worker
docker compose logs --tail 100 webhook-sink
docker compose logs --tail 100 postgres redis prometheus toxiproxy
```

Every experiment creates `docs/results/experiments/<run-id>/`. Start diagnosis with:

1. `report.json` for the final status and invariant summary.
2. `timeline.jsonl` for lifecycle order and failure time.
3. `response-events.jsonl` and `response.json` for MTTD/MTTR inputs.
4. `load/<load-run-id>/summary.json` and `journal.jsonl` for client behavior.
5. `invariants.json` for violating IDs and evidence counts.
6. `controller.log` when the experiment enabled the controller.

If an interrupted run leaves `.chaos-experiment.lock` behind, first confirm that no
runner process is active and all faults have been reverted. Only then remove that one
lock file manually.

## Stop the stack

Preserve database and Redis volumes:

```powershell
docker compose down
```

`docker compose down -v` destroys the project volumes and all local evidence stored in
PostgreSQL/Redis. Do not use `-v` unless that data loss is intentional.
