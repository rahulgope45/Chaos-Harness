# Baseline load runs

Five seeded, open-loop runs exercised the containerized payment API on 2026-10-04.
Each run preserves its append-only client journal and machine-readable summary under
`docs/results/baseline/<run-id>/`.

| Seed | Run ID                                           | Operations | Replays | Failed | Client p95 | Throughput |
| ---: | ------------------------------------------------ | ---------: | ------: | -----: | ---------: | ---------: |
|   41 | `baseline-2026-10-04T03-03-21-324Z-s41-ecec334c` |         51 |       4 |      0 |      40 ms |   10.559/s |
|   42 | `baseline-2026-10-04T03-03-26-833Z-s42-f40af1e9` |         50 |       1 |      0 |      41 ms |   10.171/s |
|   43 | `baseline-2026-10-04T03-03-32-462Z-s43-eaf2bd9d` |         29 |       1 |      0 |      38 ms |    6.005/s |
|   44 | `baseline-2026-10-04T03-03-37-980Z-s44-d04bf1c8` |         46 |       0 |      0 |      34 ms |   10.132/s |
|   45 | `baseline-2026-10-04T03-03-43-143Z-s45-1a2c636b` |         52 |       3 |      0 |      38 ms |   10.385/s |

Across the five runs, 228 of 228 scheduled operations succeeded. Mean client p95 was
38.2 ms (34–41 ms), and mean achieved throughput was 9.451 requests/second. The
variation in scheduled operation count is expected from the seeded Poisson arrival
process.

These deliberately short, five-second runs establish that the generator, journal,
summary, and metrics pipeline work reproducibly. They are development evidence, not a
long-duration capacity claim; longer baseline and fault runs are required before the
final portfolio report.
