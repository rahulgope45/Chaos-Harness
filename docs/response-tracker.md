# Response tracker

The response tracker validates and appends nine event types to `response-events.jsonl`:
`fault_injected`, `anomaly_detected`, `plan_selected`, `action_executed`,
`telemetry_unavailable`, `telemetry_restored`, `telemetry_invalid`,
`telemetry_validated`, and `recovered`. The runner writes fault and recovery events; the
controller writes application-response and telemetry-state events through the same
schema without directly calling runner code.

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

FS-3 telemetry events are preserved in the same event list but are not substituted for
application anomaly detection. Therefore the verified sensor-outage run correctly has
MTTD `null` while still proving that the controller entered and exited blind mode.

FS-2 invalid/validated events are likewise not substituted for application anomaly
detection. The separate `fs2-assessment.json` counts controller actions only after the
run's own fault event and reports a false-action count only while the Docker-observed
controller target remained healthy.
