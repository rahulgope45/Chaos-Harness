# FS-4 network fault injection

FS-4 uses Toxiproxy to mutate only three static dependency paths:

| Proxy          | Managed path                   | Listen           | Upstream            |
| -------------- | ------------------------------ | ---------------- | ------------------- |
| `api-postgres` | payment API to PostgreSQL      | `toxiproxy:8666` | `postgres:5432`     |
| `api-redis`    | payment API to Redis           | `toxiproxy:8667` | `redis:6379`        |
| `worker-sink`  | payment worker to webhook sink | `toxiproxy:8668` | `webhook-sink:3002` |

The experiment schema supports `latency` with optional jitter, `timeout`, and
`reset_peer`, in either stream direction. Toxiproxy is a TCP proxy, so these controls do
not constitute true packet loss. The upstream project documents the toxic types and
HTTP API at <https://github.com/Shopify/toxiproxy>.

The runner validates the proxy name, confirms it exists, and registers an idempotent
removal before adding the run-specific toxic. The normal revert phase and the outer
safety cleanup both remove it. Dry-run performs the proxy preflight but creates no toxic.

Run a dry-run or a real experiment with:

```powershell
npm run start --workspace @chaos/runner -- experiments/postgres-latency-retry.yml --dry-run
npm run start --workspace @chaos/runner -- experiments/postgres-latency-retry.yml
```

## Verified evidence

### PostgreSQL latency and jitter

Run `postgres-latency-retry-2026-10-04T04-46-57-637Z-c333a74c` applied 750 ms downstream
latency with 100 ms jitter after two seconds. It scheduled 105 operations: 31 succeeded,
74 failed, and client p95 reached 2,013 ms. I1–I6 passed for acknowledged payments.

The report status means the selected correctness invariants passed. It does not mean the
service tolerated the fault well: the client failure count is a severe availability
degradation. This run did not establish a new correctness defect.

### Worker-to-sink timeout

Run `sink-timeout-retry-2026-10-04T04-47-36-937Z-734ec032` applied a one-second
downstream timeout after two seconds. All 120 load operations succeeded. I1–I5 passed,
and I6 reported 24 event IDs delivered twice.

The duplicate deliveries are expected under the injected fault and BullMQ's
at-least-once processing. I1 and I2 remained clean, so no duplicate financial effect was
observed. This is not a genuine defect finding.

Both runs removed their toxic before recovery verification; the proxy API showed no
remaining toxics afterward.
