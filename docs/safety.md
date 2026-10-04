# Safety layer

Implemented fault injectors run only through the mandatory safety boundary:

- `DOCKER_HOST` must be an approved local named pipe, Unix socket, or loopback TCP URL.
- The target must belong to Compose project `chaos-harness`, match the requested service,
  and carry `chaos-target=true`.
- `--dry-run` validates the config and live target while performing zero mutations.
- A concurrent Prometheus watcher aborts when error rate exceeds `abort_if`.
- A hard wall-clock deadline and SIGINT/SIGTERM abort signal cancel pending load.
- Every future fault must register a revert callback; callbacks run once in reverse order.
- Experiment locking and cleanup survive failure paths.

The unit suite covers remote-host, malformed-host, unlabeled-target, mismatched-target,
over-threshold, hard-timeout, reverse-order cleanup, and load-cancellation paths. A live
dry run resolved the labeled `payment-api` container and reported
`mutations_performed: 0`.

Control run `no-fault-control-2026-10-04T03-33-27-280Z-adf0733d` then passed through the
safety wrapper with 56/56 operations and I1–I6 passing. All seven Compose services were
healthy afterward.

Docker API access is effectively root-equivalent on the Docker host. The harness must
never expose its Docker connection to untrusted code or use this capability against a
remote/production daemon.
