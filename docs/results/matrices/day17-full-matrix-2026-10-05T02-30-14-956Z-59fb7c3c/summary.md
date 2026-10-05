# day17-full-matrix aggregate report

Generated: 2026-10-05T03:24:04.258Z

Coverage: **complete**. Outcome: **failures_observed**. Completed 130/130 runs.

MTTD and MTTR cells show median / p90 / min / max in milliseconds. Null timings are missing samples, not zero-duration responses.

## Experiment coverage

| Experiment                    | Fault | Planned | Completed | Passed | Failed | Distinct offsets |
| ----------------------------- | ----- | ------: | --------: | -----: | -----: | ---------------: |
| no-fault-control              | none  |      10 |        10 |     10 |      0 |                0 |
| kill-worker-with-controller   | FS_1  |      10 |        10 |     10 |      0 |               10 |
| kill-worker-mid-batch         | FS_1  |      10 |        10 |     10 |      0 |               10 |
| kill-api-after-commit         | FS_1  |      10 |        10 |      8 |      2 |               10 |
| kill-worker-after-side-effect | FS_1  |      10 |        10 |     10 |      0 |               10 |
| telemetry-spike-guard         | FS_2  |      10 |        10 |     10 |      0 |               10 |
| telemetry-drop-guard          | FS_2  |      10 |        10 |     10 |      0 |               10 |
| telemetry-freeze-guard        | FS_2  |      10 |        10 |     10 |      0 |               10 |
| telemetry-noise-guard         | FS_2  |      10 |        10 |     10 |      0 |               10 |
| telemetry-counter-reset-guard | FS_2  |      10 |        10 |     10 |      0 |               10 |
| sensor-outage-blind-mode      | FS_3  |      10 |        10 |     10 |      0 |               10 |
| postgres-latency-retry        | FS_4  |      10 |        10 |     10 |      0 |               10 |
| sink-timeout-retry            | FS_4  |      10 |        10 |     10 |      0 |               10 |

## Response statistics by fault class

| Fault | Runs | MTTD ms                                         | MTTR ms                                    | Client p95 ms                        |
| ----- | ---: | ----------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| none  |   10 | — (0 samples, 10 missing)                       | — (0 samples, 10 missing)                  | 31 / 36 / 30 / 57 (10 samples)       |
| FS_1  |   40 | 632 / 872 / 615 / 1004 (10 samples, 30 missing) | 7085 / 8706 / 5885 / 9491 (40 samples)     | 39 / 117 / 28 / 338 (40 samples)     |
| FS_2  |   50 | — (0 samples, 50 missing)                       | 26107 / 27638 / 24213 / 28822 (50 samples) | 31 / 34 / 30 / 40 (50 samples)       |
| FS_3  |   10 | — (0 samples, 10 missing)                       | 16081 / 16785 / 15098 / 17545 (10 samples) | 34 / 37 / 32 / 42 (10 samples)       |
| FS_4  |   20 | — (0 samples, 20 missing)                       | 8829 / 11143 / 6100 / 11939 (20 samples)   | 1022 / 2015 / 29 / 2016 (20 samples) |

## Invariant outcomes by fault class

| Fault | Invariant | Observed | Pass | Report-only | Fail | Pass rate | Non-failure rate |
| ----- | --------- | -------: | ---: | ----------: | ---: | --------: | ---------------: |
| none  | I1        |       10 |   10 |           0 |    0 |         1 |                1 |
| none  | I2        |       10 |   10 |           0 |    0 |         1 |                1 |
| none  | I3        |       10 |   10 |           0 |    0 |         1 |                1 |
| none  | I4        |       10 |   10 |           0 |    0 |         1 |                1 |
| none  | I5        |       10 |   10 |           0 |    0 |         1 |                1 |
| none  | I6        |       10 |   10 |           0 |    0 |         1 |                1 |
| FS_1  | I1        |       40 |   40 |           0 |    0 |         1 |                1 |
| FS_1  | I2        |       40 |   40 |           0 |    0 |         1 |                1 |
| FS_1  | I3        |       40 |   40 |           0 |    0 |         1 |                1 |
| FS_1  | I4        |       40 |   40 |           0 |    0 |         1 |                1 |
| FS_1  | I5        |       40 |   38 |           0 |    2 |      0.95 |             0.95 |
| FS_1  | I6        |       40 |   30 |          10 |    0 |      0.75 |                1 |
| FS_2  | I1        |       50 |   50 |           0 |    0 |         1 |                1 |
| FS_2  | I2        |       50 |   50 |           0 |    0 |         1 |                1 |
| FS_2  | I3        |       50 |   50 |           0 |    0 |         1 |                1 |
| FS_2  | I4        |       50 |   50 |           0 |    0 |         1 |                1 |
| FS_2  | I5        |       50 |   50 |           0 |    0 |         1 |                1 |
| FS_2  | I6        |       50 |   50 |           0 |    0 |         1 |                1 |
| FS_3  | I1        |       10 |   10 |           0 |    0 |         1 |                1 |
| FS_3  | I2        |       10 |   10 |           0 |    0 |         1 |                1 |
| FS_3  | I3        |       10 |   10 |           0 |    0 |         1 |                1 |
| FS_3  | I4        |       10 |   10 |           0 |    0 |         1 |                1 |
| FS_3  | I5        |       10 |   10 |           0 |    0 |         1 |                1 |
| FS_3  | I6        |       10 |   10 |           0 |    0 |         1 |                1 |
| FS_4  | I1        |       20 |   20 |           0 |    0 |         1 |                1 |
| FS_4  | I2        |       20 |   20 |           0 |    0 |         1 |                1 |
| FS_4  | I3        |       20 |   20 |           0 |    0 |         1 |                1 |
| FS_4  | I4        |       20 |   20 |           0 |    0 |         1 |                1 |
| FS_4  | I5        |       20 |   20 |           0 |    0 |         1 |                1 |
| FS_4  | I6        |       20 |   10 |          10 |    0 |       0.5 |                1 |

## Evidence run IDs

### no-fault-control

- `no-fault-control-2026-10-05T02-30-14-998Z-3969b228`
- `no-fault-control-2026-10-05T02-30-21-453Z-58f44e1a`
- `no-fault-control-2026-10-05T02-30-27-640Z-e0d13a19`
- `no-fault-control-2026-10-05T02-30-33-883Z-7fc65e0b`
- `no-fault-control-2026-10-05T02-30-39-999Z-8cdc6130`
- `no-fault-control-2026-10-05T02-30-46-181Z-c2bcc248`
- `no-fault-control-2026-10-05T02-30-52-410Z-83e0652b`
- `no-fault-control-2026-10-05T02-30-58-637Z-1b863e95`
- `no-fault-control-2026-10-05T02-31-04-851Z-a4393ad8`
- `no-fault-control-2026-10-05T02-31-10-981Z-e60eaae3`

### kill-worker-with-controller

- `kill-worker-with-controller-2026-10-05T02-31-17-196Z-9e3324b3`
- `kill-worker-with-controller-2026-10-05T02-31-29-548Z-a7c38305`
- `kill-worker-with-controller-2026-10-05T02-31-41-789Z-35635046`
- `kill-worker-with-controller-2026-10-05T02-31-54-918Z-ab336b69`
- `kill-worker-with-controller-2026-10-05T02-32-08-728Z-9ce3a06d`
- `kill-worker-with-controller-2026-10-05T02-32-20-834Z-2fadf9ef`
- `kill-worker-with-controller-2026-10-05T02-32-32-840Z-d6eab239`
- `kill-worker-with-controller-2026-10-05T02-32-44-950Z-0c2f7f25`
- `kill-worker-with-controller-2026-10-05T02-32-57-003Z-d7638709`
- `kill-worker-with-controller-2026-10-05T02-33-08-981Z-9ce84a09`

### kill-worker-mid-batch

- `kill-worker-mid-batch-2026-10-05T02-33-21-090Z-ca148ca1`
- `kill-worker-mid-batch-2026-10-05T02-33-31-177Z-88a6d163`
- `kill-worker-mid-batch-2026-10-05T02-33-42-317Z-acad4df8`
- `kill-worker-mid-batch-2026-10-05T02-33-54-173Z-e1d7f120`
- `kill-worker-mid-batch-2026-10-05T02-34-05-714Z-639b6b8b`
- `kill-worker-mid-batch-2026-10-05T02-34-17-900Z-ef908f85`
- `kill-worker-mid-batch-2026-10-05T02-34-29-520Z-03329ab5`
- `kill-worker-mid-batch-2026-10-05T02-34-39-630Z-84044162`
- `kill-worker-mid-batch-2026-10-05T02-34-49-536Z-cc97f4bf`
- `kill-worker-mid-batch-2026-10-05T02-34-59-382Z-8cc63029`

### kill-api-after-commit

- `kill-api-after-commit-2026-10-05T02-35-10-283Z-01f04171`
- `kill-api-after-commit-2026-10-05T02-35-20-685Z-363c6a04`
- `kill-api-after-commit-2026-10-05T02-36-15-379Z-27713897`
- `kill-api-after-commit-2026-10-05T02-36-25-325Z-538197d3`
- `kill-api-after-commit-2026-10-05T02-36-35-685Z-2609b1c7`
- `kill-api-after-commit-2026-10-05T02-36-45-704Z-a0a4762c`
- `kill-api-after-commit-2026-10-05T02-36-55-678Z-5f796bc2`
- `kill-api-after-commit-2026-10-05T02-37-05-642Z-ab6888d2`
- `kill-api-after-commit-2026-10-05T02-37-15-648Z-ee48b428`
- `kill-api-after-commit-2026-10-05T02-38-10-530Z-8bbaa3d2`

### kill-worker-after-side-effect

- `kill-worker-after-side-effect-2026-10-05T02-38-20-537Z-9f16f98d`
- `kill-worker-after-side-effect-2026-10-05T02-40-00-764Z-c6e3b2d6`
- `kill-worker-after-side-effect-2026-10-05T02-41-40-246Z-3a41bd8c`
- `kill-worker-after-side-effect-2026-10-05T02-42-49-915Z-f52d50cc`
- `kill-worker-after-side-effect-2026-10-05T02-43-59-497Z-56465ea4`
- `kill-worker-after-side-effect-2026-10-05T02-45-08-877Z-7a71a68f`
- `kill-worker-after-side-effect-2026-10-05T02-46-18-399Z-3dbcb70c`
- `kill-worker-after-side-effect-2026-10-05T02-47-28-329Z-871f602f`
- `kill-worker-after-side-effect-2026-10-05T02-48-37-874Z-35bc6555`
- `kill-worker-after-side-effect-2026-10-05T02-50-17-425Z-2665d0dd`

### telemetry-spike-guard

- `telemetry-spike-guard-2026-10-05T02-51-57-383Z-707862c5`
- `telemetry-spike-guard-2026-10-05T02-52-29-181Z-b2658acf`
- `telemetry-spike-guard-2026-10-05T02-52-59-586Z-228ffc19`
- `telemetry-spike-guard-2026-10-05T02-53-29-767Z-838db1c4`
- `telemetry-spike-guard-2026-10-05T02-53-59-030Z-7794efb6`
- `telemetry-spike-guard-2026-10-05T02-54-29-172Z-45cbfc4f`
- `telemetry-spike-guard-2026-10-05T02-54-59-513Z-c95e65b8`
- `telemetry-spike-guard-2026-10-05T02-55-28-863Z-f1c1f3af`
- `telemetry-spike-guard-2026-10-05T02-55-59-266Z-2f0594ee`
- `telemetry-spike-guard-2026-10-05T02-56-29-380Z-6424791a`

### telemetry-drop-guard

- `telemetry-drop-guard-2026-10-05T02-56-59-627Z-6cc3f447`
- `telemetry-drop-guard-2026-10-05T02-57-28-975Z-04ae33a7`
- `telemetry-drop-guard-2026-10-05T02-57-59-264Z-fbb88ed8`
- `telemetry-drop-guard-2026-10-05T02-58-29-627Z-a7eb5cc8`
- `telemetry-drop-guard-2026-10-05T02-58-59-706Z-e9a8e0d6`
- `telemetry-drop-guard-2026-10-05T02-59-28-965Z-f421af39`
- `telemetry-drop-guard-2026-10-05T02-59-59-373Z-b0ac0672`
- `telemetry-drop-guard-2026-10-05T03-00-29-744Z-6a3d859e`
- `telemetry-drop-guard-2026-10-05T03-00-59-802Z-3930b0c2`
- `telemetry-drop-guard-2026-10-05T03-01-29-123Z-781ef4b0`

### telemetry-freeze-guard

- `telemetry-freeze-guard-2026-10-05T03-01-59-501Z-8c4fddde`
- `telemetry-freeze-guard-2026-10-05T03-02-28-734Z-cc1ccc91`
- `telemetry-freeze-guard-2026-10-05T03-02-59-099Z-e3b4c341`
- `telemetry-freeze-guard-2026-10-05T03-03-29-316Z-b0b6883f`
- `telemetry-freeze-guard-2026-10-05T03-03-58-718Z-ff5637d8`
- `telemetry-freeze-guard-2026-10-05T03-04-30-100Z-a194fa5d`
- `telemetry-freeze-guard-2026-10-05T03-04-59-519Z-bc505119`
- `telemetry-freeze-guard-2026-10-05T03-05-29-528Z-6a2f00e0`
- `telemetry-freeze-guard-2026-10-05T03-05-59-818Z-4a266198`
- `telemetry-freeze-guard-2026-10-05T03-06-29-326Z-d09f2dab`

### telemetry-noise-guard

- `telemetry-noise-guard-2026-10-05T03-06-59-634Z-4141c39c`
- `telemetry-noise-guard-2026-10-05T03-07-30-049Z-b222e421`
- `telemetry-noise-guard-2026-10-05T03-07-59-318Z-80bc113b`
- `telemetry-noise-guard-2026-10-05T03-08-29-458Z-7173f26b`
- `telemetry-noise-guard-2026-10-05T03-08-59-880Z-3d29f76b`
- `telemetry-noise-guard-2026-10-05T03-09-29-292Z-52094292`
- `telemetry-noise-guard-2026-10-05T03-09-59-297Z-a2dfa1d4`
- `telemetry-noise-guard-2026-10-05T03-10-29-530Z-d6111eaf`
- `telemetry-noise-guard-2026-10-05T03-10-58-841Z-315074ec`
- `telemetry-noise-guard-2026-10-05T03-11-30-069Z-b17bbe7c`

### telemetry-counter-reset-guard

- `telemetry-counter-reset-guard-2026-10-05T03-11-59-251Z-4e80f9a2`
- `telemetry-counter-reset-guard-2026-10-05T03-12-29-506Z-106cc987`
- `telemetry-counter-reset-guard-2026-10-05T03-12-58-808Z-7b4843eb`
- `telemetry-counter-reset-guard-2026-10-05T03-13-29-188Z-25e08b64`
- `telemetry-counter-reset-guard-2026-10-05T03-13-59-460Z-1c384f75`
- `telemetry-counter-reset-guard-2026-10-05T03-14-29-503Z-ca86b738`
- `telemetry-counter-reset-guard-2026-10-05T03-14-58-783Z-d679be78`
- `telemetry-counter-reset-guard-2026-10-05T03-15-29-219Z-79d8d54f`
- `telemetry-counter-reset-guard-2026-10-05T03-15-59-581Z-f0c44311`
- `telemetry-counter-reset-guard-2026-10-05T03-16-29-710Z-9b43d008`

### sensor-outage-blind-mode

- `sensor-outage-blind-mode-2026-10-05T03-16-59-082Z-af5d4b6a`
- `sensor-outage-blind-mode-2026-10-05T03-17-19-743Z-c041e7db`
- `sensor-outage-blind-mode-2026-10-05T03-17-39-199Z-72c77f26`
- `sensor-outage-blind-mode-2026-10-05T03-17-59-763Z-1bd0bad9`
- `sensor-outage-blind-mode-2026-10-05T03-18-19-722Z-a64d3b44`
- `sensor-outage-blind-mode-2026-10-05T03-18-39-532Z-34e9934f`
- `sensor-outage-blind-mode-2026-10-05T03-18-59-326Z-04737084`
- `sensor-outage-blind-mode-2026-10-05T03-19-17-887Z-45289244`
- `sensor-outage-blind-mode-2026-10-05T03-19-39-216Z-86b31687`
- `sensor-outage-blind-mode-2026-10-05T03-19-59-826Z-d767645c`

### postgres-latency-retry

- `postgres-latency-retry-2026-10-05T03-20-19-508Z-fbf166fe`
- `postgres-latency-retry-2026-10-05T03-20-32-760Z-61f1566f`
- `postgres-latency-retry-2026-10-05T03-20-45-989Z-94241db7`
- `postgres-latency-retry-2026-10-05T03-20-59-279Z-2d72cf1f`
- `postgres-latency-retry-2026-10-05T03-21-12-509Z-b1db9e68`
- `postgres-latency-retry-2026-10-05T03-21-25-714Z-8d4b2b31`
- `postgres-latency-retry-2026-10-05T03-21-38-825Z-bd17ef25`
- `postgres-latency-retry-2026-10-05T03-21-52-172Z-34ade38d`
- `postgres-latency-retry-2026-10-05T03-22-05-452Z-8c02e212`
- `postgres-latency-retry-2026-10-05T03-22-18-658Z-907e5928`

### sink-timeout-retry

- `sink-timeout-retry-2026-10-05T03-22-31-891Z-f448fa4a`
- `sink-timeout-retry-2026-10-05T03-22-41-154Z-b9d54796`
- `sink-timeout-retry-2026-10-05T03-22-50-440Z-c153dfca`
- `sink-timeout-retry-2026-10-05T03-22-59-662Z-8fff59a1`
- `sink-timeout-retry-2026-10-05T03-23-08-872Z-67db1926`
- `sink-timeout-retry-2026-10-05T03-23-17-964Z-dbb3acef`
- `sink-timeout-retry-2026-10-05T03-23-27-233Z-c3a9d6a4`
- `sink-timeout-retry-2026-10-05T03-23-36-521Z-1807b150`
- `sink-timeout-retry-2026-10-05T03-23-45-739Z-92bdbfba`
- `sink-timeout-retry-2026-10-05T03-23-55-007Z-1cbc5d62`

Control runs have no injected fault, so MTTD and MTTR are not applicable. Telemetry corruption and outage modes remain deliberate fault injections and are not genuine defect findings.
