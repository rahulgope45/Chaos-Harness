# FS-1 service outage injector

FS-1 supports `kill`, `stop`, `pause`, and `restart` against a preflight-approved local
Compose target. It registers recovery before mutation and uses the safety session's
LIFO cleanup for normal completion, errors, deadlines, and process signals.

## Verified runs

- `kill-worker-mid-batch-2026-10-04T03-41-27-310Z-2d81a6eb`: 394/394 operations
  succeeded, I1–I6 passed, and the worker returned healthy. This is resilience evidence,
  not a bug finding.
- `kill-api-after-commit-2026-10-04T03-43-44-836Z-2b69c248`: the API was restored
  healthy, but I5 failed for four committed payments with no delivery or DLQ record.
  See finding F-001.

Both experiments preserve their config, timeline, load journal, invariant output, and
report under `docs/results/experiments/<run-id>/`.

## Day 17 repeated evidence

Matrix `day17-full-matrix-2026-10-05T02-30-14-956Z-59fb7c3c` ran all four implemented
FS-1 configurations ten times each. Thirty-eight reports passed; two
`kill-api-after-commit` reports failed only I5 and reproduced known F-001:

- `kill-api-after-commit-2026-10-05T02-35-20-685Z-363c6a04`;
- `kill-api-after-commit-2026-10-05T02-37-15-648Z-ee48b428`.

Each failing run left two committed payments without delivery or dead letter. These are
additional reproductions of the same dual-write defect, not new findings. Across all 40
FS-1 runs, MTTR median/p90/min/max was 7,085/8,706/5,885/9,491 ms. Only the ten
controller-enabled runs emitted application anomaly events; their MTTD was
632/872/615/1,004 ms.
