# FS-3 sensor disruption and blind mode

## Sensor path

`services/metrics-proxy` is a pass-through sensor between Prometheus and the current
application metric endpoints:

| Prometheus job   | Proxy route               | Upstream                      |
| ---------------- | ------------------------- | ----------------------------- |
| `payment-api`    | `/metrics/payment-api`    | `payment-api:3000/metrics`    |
| `payment-worker` | `/metrics/payment-worker` | `payment-worker:3001/metrics` |

The proxy exposes `/healthz` independently from its upstreams. Prometheus keeps the
original job names, so existing recording rules continue to work, while the target
instance identifies `metrics-proxy:3003` as the sensor path.

## FS-3 behavior

FS-3 accepts only `target: metrics-proxy` and `action: stop`. The runner:

1. resolves the local `chaos-harness` container with `chaos-target=true`;
2. verifies both proxy-backed Prometheus jobs are up;
3. registers container recovery before mutation;
4. stops the sensor after the configured injection delay;
5. restores it in the guaranteed revert phase; and
6. waits for both scrape targets and the normal steady-state bound before recovery.

The controller queries the two proxy-backed `up` series every cycle. Missing/down series
cause one `telemetry_unavailable` transition event with `mode: blind` and
`fallback: docker`. The controller does not translate absent metrics into an application
failure. Its current restart policy uses Docker state, which remains independently
observable. A healthy worker therefore receives no restart plan or action. Restoration
emits `telemetry_restored`.

## Verified experiment

Run `sensor-outage-blind-mode-2026-10-04T05-26-35-890Z-e0f0d4a8` stopped the metrics
proxy during a 14-second, 15 requests/second workload.

| Measurement                           |             Result |
| ------------------------------------- | -----------------: |
| Load operations                       | 214/214 successful |
| Client p95                            |              46 ms |
| Blind-mode alert                      |            emitted |
| Telemetry-restored event              |            emitted |
| Controller anomaly/plan/action events |          0 / 0 / 0 |
| Invariants                            |       I1-I6 passed |
| Recovery time from injection          |          14,932 ms |

The first blind-mode observation listed `payment-worker`, whose proxy-backed scrape had
already changed to down; the controller remained blind until both required jobs were up.
The absence of `anomaly_detected`, `plan_selected`, and `action_executed` events proves
that the sensor outage did not trigger a restart of the healthy worker.

MTTD remains `null` because the telemetry alert is not classified as an application
anomaly. The reported recovery time includes sensor restoration, a successful
Prometheus scrape, and two consecutive healthy recovery samples. This is one functional
run, not aggregate performance evidence.

Run it with:

```powershell
npm run start --workspace @chaos/runner -- experiments/sensor-outage-blind-mode.yml --dry-run
npm run start --workspace @chaos/runner -- experiments/sensor-outage-blind-mode.yml
```
