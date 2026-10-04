# Response tracker

The response tracker validates and appends five event types to
`response-events.jsonl`: `fault_injected`, `anomaly_detected`, `plan_selected`,
`action_executed`, and `recovered`. The runner writes fault and recovery events; the
controller writes the middle three through the same schema without directly calling
runner code.

Each run produces `response.json` with schema version 1, source timestamps, the effective
recovery bound, and these durations:

- MTTD: anomaly detected minus fault injected
- MTTR: recovered minus fault injected
- detection-to-plan, plan-to-action, and action-to-recovery

Unavailable boundaries remain `null`. This prevents a runner phase timestamp from being
misrepresented as controller detection or action latency.

## Verified run

FS-1 run `kill-worker-mid-batch-2026-10-04T04-19-35-332Z-791c2def` recorded:

- fault injected: `2026-10-04T04:19:38.014Z`
- recovered: `2026-10-04T04:19:44.953Z`
- unhealed MTTR: 6,939 ms
- MTTD: `null`, because no controller was running
- recovery bound: error rate at most 0.02 for two consecutive one-second samples
- load result: 394/394 operations succeeded; I1–I6 passed

This is one integration proof, not an aggregate performance claim. Day 17 requires at
least ten repeats before publishing median or p90 response statistics.
