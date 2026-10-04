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
