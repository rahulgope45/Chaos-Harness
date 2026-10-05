# day18-gap-matrix aggregate report

Generated: 2026-10-05T03:51:44.578Z

Coverage: **complete**. Outcome: **all_passed**. Completed 30/30 runs.

MTTD and MTTR cells show median / p90 / min / max in milliseconds. Null timings are missing samples, not zero-duration responses.

## Experiment coverage

| Experiment | Fault | Planned | Completed | Passed | Failed | Distinct offsets |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| redis-outage-peak | FS_1 | 10 | 10 | 10 | 0 | 10 |
| controller-restart-during-worker-outage | FS_1 | 10 | 10 | 10 | 0 | 10 |
| postgres-latency-peak | FS_4 | 10 | 10 | 10 | 0 | 10 |

## Response statistics by fault class

| Fault | Runs | MTTD ms | MTTR ms | Client p95 ms |
| --- | ---: | --- | --- | --- |
| FS_1 | 20 | 1871 / 3420 / 1726 / 3745 (10 samples, 10 missing) | 10693 / 13325 / 8285 / 13666 (20 samples) | 1121.5 / 2015 / 32 / 2016 (20 samples) |
| FS_4 | 10 | — (0 samples, 10 missing) | 13352.5 / 13690 / 12350 / 13876 (10 samples) | 2014 / 2015 / 2011 / 2015 (10 samples) |

## Invariant outcomes by fault class

| Fault | Invariant | Observed | Pass | Report-only | Fail | Pass rate | Non-failure rate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FS_1 | I1 | 20 | 20 | 0 | 0 | 1 | 1 |
| FS_1 | I2 | 20 | 20 | 0 | 0 | 1 | 1 |
| FS_1 | I3 | 20 | 20 | 0 | 0 | 1 | 1 |
| FS_1 | I4 | 20 | 20 | 0 | 0 | 1 | 1 |
| FS_1 | I5 | 20 | 20 | 0 | 0 | 1 | 1 |
| FS_1 | I6 | 20 | 20 | 0 | 0 | 1 | 1 |
| FS_4 | I1 | 10 | 10 | 0 | 0 | 1 | 1 |
| FS_4 | I2 | 10 | 10 | 0 | 0 | 1 | 1 |
| FS_4 | I3 | 10 | 10 | 0 | 0 | 1 | 1 |
| FS_4 | I4 | 10 | 10 | 0 | 0 | 1 | 1 |
| FS_4 | I5 | 10 | 10 | 0 | 0 | 1 | 1 |
| FS_4 | I6 | 10 | 10 | 0 | 0 | 1 | 1 |

## Evidence run IDs

### redis-outage-peak

- `redis-outage-peak-2026-10-05T03-43-56-627Z-7730cb04`
- `redis-outage-peak-2026-10-05T03-44-12-598Z-966731be`
- `redis-outage-peak-2026-10-05T03-44-32-959Z-5b7a5f62`
- `redis-outage-peak-2026-10-05T03-44-51-111Z-7cfcabac`
- `redis-outage-peak-2026-10-05T03-45-12-719Z-a57b9d73`
- `redis-outage-peak-2026-10-05T03-45-29-758Z-b5eeea13`
- `redis-outage-peak-2026-10-05T03-45-46-354Z-75a994ba`
- `redis-outage-peak-2026-10-05T03-46-07-653Z-f0677169`
- `redis-outage-peak-2026-10-05T03-46-23-579Z-d9764078`
- `redis-outage-peak-2026-10-05T03-46-41-713Z-ce57e25d`

### controller-restart-during-worker-outage

- `controller-restart-during-worker-outage-2026-10-05T03-47-00-920Z-ff0a9982`
- `controller-restart-during-worker-outage-2026-10-05T03-47-13-811Z-8d454285`
- `controller-restart-during-worker-outage-2026-10-05T03-47-26-097Z-50695f10`
- `controller-restart-during-worker-outage-2026-10-05T03-47-38-319Z-3cd05aa0`
- `controller-restart-during-worker-outage-2026-10-05T03-47-53-287Z-1b0c2d12`
- `controller-restart-during-worker-outage-2026-10-05T03-48-06-918Z-8b8682fd`
- `controller-restart-during-worker-outage-2026-10-05T03-48-19-236Z-c7b62786`
- `controller-restart-during-worker-outage-2026-10-05T03-48-32-147Z-be8528ff`
- `controller-restart-during-worker-outage-2026-10-05T03-48-44-975Z-5bccb24c`
- `controller-restart-during-worker-outage-2026-10-05T03-48-57-305Z-56a11d58`

### postgres-latency-peak

- `postgres-latency-peak-2026-10-05T03-49-09-467Z-ce4197ef`
- `postgres-latency-peak-2026-10-05T03-49-25-027Z-b1c97075`
- `postgres-latency-peak-2026-10-05T03-49-40-437Z-ab8f7cf4`
- `postgres-latency-peak-2026-10-05T03-49-55-830Z-0d391e13`
- `postgres-latency-peak-2026-10-05T03-50-11-199Z-84da26d4`
- `postgres-latency-peak-2026-10-05T03-50-26-655Z-e8b69d26`
- `postgres-latency-peak-2026-10-05T03-50-42-055Z-ed385278`
- `postgres-latency-peak-2026-10-05T03-50-57-531Z-84c25be2`
- `postgres-latency-peak-2026-10-05T03-51-13-491Z-2ffcf798`
- `postgres-latency-peak-2026-10-05T03-51-29-024Z-1b80008c`

Control runs have no injected fault, so MTTD and MTTR are not applicable. Telemetry corruption and outage modes remain deliberate fault injections and are not genuine defect findings.
