# Experiment runner

The runner validates YAML with Zod, prevents concurrent experiments with a repository
lock, creates a unique artifact directory, and executes:

`preflight → baseline → inject → observe → revert → recovery wait → verify → report`

`revert` is in a `finally` path and is unit-tested to run when observation fails. Each
successful run preserves the validated config, phase timeline, Prometheus baseline,
load journal and summary, invariant output, and final JSON report.

`fault: none` and FS-1 are executable. FS-1 supports kill, stop, pause, and restart
behind the safety layer. FS-2 through FS-4 remain deliberately refused until their
corresponding injectors are installed.

Experiments may set `duplicate_observation_s` independently of
`invariant_drain_timeout_s`. The former watches for delayed duplicate transport events;
the latter waits for every committed payment to reach delivery or dead letter. Generated
idempotency keys include the unique load run ID, so repeated seeds reproduce workload
shape without reusing persisted payment identity across runs.

Run the control experiment:

```powershell
npm run start --workspace @chaos/runner -- experiments/control.yml
```

## Verified control

Run `no-fault-control-2026-10-04T03-24-48-758Z-3b023a1f` completed every lifecycle
phase. Its seeded load run scheduled 56 operations; all 56 succeeded, including three
idempotent replays. I1–I6 all passed, with I6 using the stricter no-fault failure policy.
The complete evidence is under `docs/results/experiments/<run-id>/`.
