# Experiment runner

The runner validates YAML with Zod, prevents concurrent experiments with a repository
lock, creates a unique artifact directory, and executes:

`preflight → baseline → inject → observe → revert → recovery wait → verify → report`

`revert` is in a `finally` path and is unit-tested to run when observation fails. Each
successful run preserves the validated config, phase timeline, Prometheus baseline,
load journal and summary, invariant output, and final JSON report.

Only `fault: none` is currently executable. Configurations for FS-1 through FS-4 are
parsed but deliberately refused until the safety layer and corresponding injector are
installed.

Run the control experiment:

```powershell
npm run start --workspace @chaos/runner -- experiments/control.yml
```

## Verified control

Run `no-fault-control-2026-10-04T03-24-48-758Z-3b023a1f` completed every lifecycle
phase. Its seeded load run scheduled 56 operations; all 56 succeeded, including three
idempotent replays. I1–I6 all passed, with I6 using the stricter no-fault failure policy.
The complete evidence is under `docs/results/experiments/<run-id>/`.
