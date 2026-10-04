# Worker crash after webhook persistence

Run `kill-worker-after-side-effect-2026-10-04T04-04-15-336Z-b564632d` delayed webhook
responses by 1.5 seconds and killed `payment-worker` two seconds into an eight-second,
20 requests/second load. The safety layer restarted the worker and reset the sink mode.

The run completed 153/153 operations, representing 151 unique payments and two
intentional in-run idempotent replays. I1–I5 passed. I6 reported four event IDs delivered
twice after BullMQ recovered stalled work.

This is expected at-least-once transport behavior under ADR-0004. It is report-only
because a real fault was injected. The hard financial invariants remained clean, so the
run does not support a claim of duplicate financial processing or a product defect.

The experiment also exposed genuine harness finding F-002: earlier runs reused the
seed-derived key namespace and could attribute historical deliveries to a new run. The
fixed evidence above uses unique run-scoped keys.
