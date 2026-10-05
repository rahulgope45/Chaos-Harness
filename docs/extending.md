# Extending the harness

Add one capability at a time and keep the evidence path intact. A new injector is not
complete merely because it can break something; it must be bounded, reversible,
observable, and verified by a real run.

## Add a fault adapter

Use `harness/runner/src/adapters/fault-adapter.ts` as the contract and
`example-http-adapter.ts` as a compile-tested reference. The example is intentionally not
wired into the experiment schema or enabled at runtime.

A production adapter must:

1. validate a narrow configuration schema;
2. resolve and verify the exact target during preflight;
3. reject remote or non-allowlisted control endpoints;
4. register an idempotent revert before the first mutation;
5. pass the experiment abort signal or use bounded request timeouts;
6. emit timeline evidence for injection and revert;
7. add refusal, mutation, revert, abort, and interrupted-cleanup tests; and
8. remain disabled until a dry-run and a real local run are preserved.

The HTTP example demonstrates allowlisted target/mode resolution, loopback-only control,
deterministic resource cleanup, and revert-before-mutation ordering. It is a scaffold,
not a fifth implemented fault class.

To enable a real adapter, update the experiment Zod schema and semantic validation,
runner preflight/injection dispatch, dry-run output, documentation, and matrix coverage
in the same feature. Do not add an adapter by bypassing `SafetySession`.

## Add an invariant

1. Give the invariant a stable ID and a one-sentence business contract.
2. Define the authoritative data source and run-isolation window.
3. Add clean, violating, empty, and contaminated fixtures.
4. Return typed evidence with exact violating IDs; never only a Boolean.
5. Decide whether the result is hard failure or report-only and record that policy in an
   ADR when context changes its meaning.
6. Add the invariant to the control run before trusting it under faults.

Synthetic corruption used to prove the checker belongs under `docs/results/synthetic`
and must never be counted as a discovered defect.

## Add a managed service

Give the service `/healthz`; add `/readyz` when dependency readiness matters. Bind its
published port to `127.0.0.1`, pin external images, use a non-secret local default in
`.env.example`, and add it to the startup runbook. Apply `chaos-target=true` only when
the runner is explicitly allowed to mutate it. Source-of-truth and evidence services
should remain outside the direct mutation allowlist unless a reviewed ADR changes the
blast radius.

If experiments depend on the service, add it to runner preflight and the matrix readiness
barrier. A Compose health check alone is not enough to prevent cross-repeat contamination.

## Add an experiment

- State one falsifiable hypothesis.
- Use a unique seed and run-isolated identities.
- Start with `repeat: 1` and a dry-run.
- Set a hard maximum duration, recovery bound, abort threshold, and invariant drain.
- Verify cleanup: containers healthy, no active toxics, telemetry mode `none`, and no
  experiment lock.
- Preserve the run ID before making any correctness or timing claim.
- Add N>=10 matrix coverage only after the single-run lifecycle is stable.

## Definition of done

- Lint, formatting, typecheck, unit, and relevant live integration tests pass.
- Observable behavior is verified, not inferred from code.
- New measured claims name their run IDs and artifacts.
- `AI_CONTEXT.md`, the feature document, startup instructions, and day history agree.
- The feature is committed with its evidence as one independently useful milestone.
