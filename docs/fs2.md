# FS-2 telemetry corruption and guarded control

## Injection path

The local metrics proxy owns an authenticated control surface:

- `GET /chaos/state` reports the current allowlisted mode.
- `PUT /chaos/mode` changes the mode when supplied the configured bearer token.
- `mode: none` is the normal and guaranteed cleanup state.

Only the worker scrape is corrupted. The API metrics used by the runner's error-rate
kill switch stay independent, and neither application container is mutated.

| Mode            | Injected observation                                          | Controller validation        |
| --------------- | ------------------------------------------------------------- | ---------------------------- |
| `spike`         | Huge proxy counter and worker queue-depth values              | Bounds                       |
| `drop`          | Required integrity and worker series omitted                  | Required-series presence     |
| `freeze`        | Repeated complete exposition with an old source timestamp     | Source staleness             |
| `noise`         | `NaN` integrity and queue-depth samples                       | Finite numeric values        |
| `counter_reset` | Proxy scrape and completed-job counters decrease unexpectedly | Monotonicity on newer sample |

The proxy adds source timestamp, scrape counter, and fixed-value integrity canaries.
These are sensor-health signals, not business metrics.

## Safety and acceptance

The runner requires the proxy to start in `none`, confirms all required Prometheus
series are fresh and valid, resolves the labeled local proxy, and confirms the
`payment-worker` Docker target is healthy. Cleanup back to `none` is registered before
the mode changes.

During load, the runner checks worker Docker health independently. Each run writes
`fs2-assessment.json` containing detected issues, worker-health status, action count,
false-action count, and pass/fail. Acceptance requires:

1. a post-injection `telemetry_invalid` event;
2. a later `telemetry_validated` event after revert;
3. a healthy worker throughout the observation window;
4. zero controller actions and therefore zero false actions; and
5. I1-I6 passing.

## Verified matrix

| Mode          | Run ID                                                            | Detection                    | Load    | p95    | False actions |
| ------------- | ----------------------------------------------------------------- | ---------------------------- | ------- | ------ | ------------: |
| Spike         | `telemetry-spike-guard-2026-10-05T01-49-39-559Z-2497ff69`         | out of bounds                | 230/230 | 101 ms |             0 |
| Drop          | `telemetry-drop-guard-2026-10-05T01-50-41-396Z-3d4ba237`          | missing required series      | 220/220 | 65 ms  |             0 |
| Freeze        | `telemetry-freeze-guard-2026-10-05T01-51-13-119Z-043cd742`        | stale source timestamp       | 220/220 | 81 ms  |             0 |
| Noise         | `telemetry-noise-guard-2026-10-05T01-51-46-889Z-87bc668b`         | non-finite sample            | 218/218 | 41 ms  |             0 |
| Counter reset | `telemetry-counter-reset-guard-2026-10-05T01-52-15-989Z-1011ae07` | unexplained counter decrease | 230/230 | 38 ms  |             0 |

Every scheduled operation succeeded, every controller target remained healthy, every
assessment passed, and I1-I6 passed in all five runs. These are five single-run
functional proofs, not aggregate performance statistics. The corruptions are deliberate
FS-2 fault injections and are not reported as genuine bug findings.

Run any mode first with `--dry-run`, for example:

```powershell
npm run start --workspace @chaos/runner -- experiments/telemetry-spike-guard.yml --dry-run
npm run start --workspace @chaos/runner -- experiments/telemetry-spike-guard.yml
```
