# Day 17 multi-run matrix

## Command and contract

The versioned manifest `experiments/day17-matrix.yml` covers all 13 implemented
experiment configurations. It requires ten repeats of each configuration: 130 runs in
total, including ten no-fault controls and every implemented FS-1 through FS-4 scenario.

Validate the full plan without changing the stack:

```powershell
npm run matrix -- --dry-run experiments/day17-matrix.yml
```

Run it:

```powershell
npm run matrix -- experiments/day17-matrix.yml
```

The command is serial by design. It varies seeds and deterministic pseudorandom
injection offsets, waits for suite readiness between repeats, writes a progress file
after each run, and preserves the ordinary per-run evidence directories. Exit code 2
means the matrix completed but one or more run reports contain a failure; the aggregate
artifacts are still valid and must be inspected.

## Verified matrix

Matrix run
`day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` completed all 130 planned runs.
It generated:

- `aggregate.json`: machine-readable coverage, definitions, statistics, invariant rates,
  and every contributing run ID;
- `summary.md`: the same evidence as human-readable tables;
- `manifest.json`: the normalized matrix contract;
- `progress.json`: the exact completed run list.

Observed wall time was about 53 minutes 49 seconds on the verified local environment.
That duration is not a performance target.

| Fault class | Runs | Passed | Failed | MTTD median / p90 | MTTR median / p90  | Client p95 median / p90 |
| ----------- | ---: | -----: | -----: | ----------------- | ------------------ | ----------------------- |
| Control     |   10 |     10 |      0 | not applicable    | not applicable     | 31 / 36 ms              |
| FS-1        |   40 |     38 |      2 | 632 / 872 ms      | 7,085 / 8,706 ms   | 39 / 117 ms             |
| FS-2        |   50 |     50 |      0 | missing           | 26,107 / 27,638 ms | 31 / 34 ms              |
| FS-3        |   10 |     10 |      0 | missing           | 16,081 / 16,785 ms | 34 / 37 ms              |
| FS-4        |   20 |     20 |      0 | missing           | 8,829 / 11,143 ms  | 1,022 / 2,015 ms        |

Only the ten controller-enabled FS-1 runs emitted `anomaly_detected`, so the FS-1 MTTD
distribution has 10 samples and 30 explicitly missing values. FS-2, FS-3, and FS-4 do
not substitute telemetry-state or runner events for application anomaly detection.

## Correctness outcomes

- All ten controls passed I1-I6.
- I1-I4 passed in every one of the 130 runs.
- I5 passed in 128/130 runs. The two failures were both
  `kill-api-after-commit` repetitions and reproduce known finding F-001:
  `kill-api-after-commit-2026-10-05T02-35-20-685Z-363c6a04` and
  `kill-api-after-commit-2026-10-05T02-37-15-648Z-ee48b428`. Each left two committed
  payments without delivery or dead-letter terminal state.
- I6 was report-only in all ten delayed-webhook FS-1 runs and all ten sink-timeout FS-4
  runs. Their non-failure rate was 100%; transport duplicates were not converted into
  duplicate financial effects.
- All 50 FS-2 assessments passed with zero controller actions and zero false actions.

The two failed repetitions strengthen the evidence for existing F-001. They are not
counted as new defects, and the telemetry corruptions remain deliberate injected faults.

## Day 18 gap matrix

Manifest `experiments/day18-gap-matrix.yml` covers the scenarios that were absent or not
at peak load in Day 17: Redis stopped under 100 requests/second, controller replacement
while a killed worker is observed down under 50 requests/second, and 750 ms PostgreSQL
downstream latency with 100 ms jitter under 50 requests/second. Each has ten seeds and
ten deterministic fault offsets.

Matrix `day18-gap-matrix-2026-10-05T03-43-56-583Z-d6c0aea6` completed all 30 runs and
reported `all_passed`. I1-I6 passed in every run. The ten controller scenarios also
produced ten passing `controller-restart-assessment.json` files. FS-1 median/p90 MTTR
across Redis and controller scenarios was 10,693/13,325 ms; controller-only MTTD was
1,871/3,420 ms. FS-4 PostgreSQL-latency MTTR was 13,352.5/13,690 ms and client p95 was
2,014/2,015 ms.

Redis outage produced 1,836 successful and 8,063 failed client operations across its ten
runs; PostgreSQL latency produced 880 successful and 4,089 failed operations. These are
availability degradations, not new correctness defects, because all committed run-scoped
payments reached a terminal delivery state and I1-I6 remained clean.

PostgreSQL itself remains outside the `chaos-target=true` mutation allowlist. ADR-0011
records why dependency-path latency is retained while direct database-container mutation
is excluded from this portfolio hunt.
