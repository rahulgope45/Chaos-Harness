# Demo recording script

This is the reproducible script for a 4–6 minute project walkthrough. It references only
implemented behavior and preserved evidence. No video file is currently checked in.

## Before recording

1. Use a clean terminal at the repository root.
2. Start Docker Desktop with Linux containers.
3. Confirm ports from the startup runbook are available.
4. Run `npm ci`.
5. Increase terminal font size and hide unrelated windows or secrets.

## Recording sequence

### 1. State the problem — 30 seconds

Show the README introduction and say:

> A service being healthy after restart does not prove payment correctness. This harness
> injects faults, measures recovery, and separately verifies six business invariants.

### 2. Show the architecture — 45 seconds

Walk left-to-right through the README diagram: API transaction, PostgreSQL ledger/outbox,
relay, BullMQ worker, sink, metrics proxy, controller, and runner. Point out that the
controller is structurally separate and PostgreSQL remains the financial source of truth.

### 3. Run the demo — about 2 minutes

```powershell
npm run demo
```

Explain that the command provisions/migrates/builds, runs the bounded
`ci-smoke-worker-kill` experiment, kills the worker, restores it through guaranteed
cleanup, drains asynchronous work, and checks I1-I6. Do not call the result successful
until the command prints its run ID and exits zero.

### 4. Inspect the evidence — 60 seconds

Replace `<run-id>` with the printed ID:

```powershell
Get-Content docs/results/experiments/<run-id>/report.json
Get-Content docs/results/experiments/<run-id>/timeline.jsonl
Get-Content docs/results/experiments/<run-id>/invariants.json
```

Show `status: passed`, the actual operation counts, `fault_injected`, `recovered`, and
I1-I6. Explain that MTTD is null without a controller and is not replaced by a runner
timestamp.

### 5. Show the genuine bug/fix — 60 seconds

Open `docs/findings/F-001-commit-before-enqueue-event-loss.md`. Contrast the preserved
before run with after run `kill-api-after-commit-2026-10-05T04-07-33-206Z-e4ca8f09`.
Show `docs/outbox.md` and explain why payment, ledger, and outbox intent share one
PostgreSQL transaction while the relay uses the event UUID as BullMQ job ID.

### 6. Close on scope — 30 seconds

Show the README limitations. State that this is local functional evidence, not production
capacity, Kubernetes, true packet loss, or permission to target remote Docker hosts.

## After recording

```powershell
docker compose ps
curl.exe -sS http://127.0.0.1:8474/proxies
docker compose down
```

Confirm the recorded run directory exists before stopping the stack. `down` preserves
volumes; do not use `-v` during routine cleanup.
