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

## Docker-socket threat model

Possession of the Docker socket or Windows Docker named pipe can normally create
privileged containers, mount host paths, and control other containers. The
`chaos-target=true` label is an application guardrail, not an operating-system security
boundary. A compromised runner process already has the same Docker capability as the
user who launched it.

This project reduces accidental blast radius as follows:

- the runner executes on the host and the Docker connection is not mounted into payment,
  relay, worker, sink, metrics, database, Redis, Prometheus, or Toxiproxy containers;
- non-local `DOCKER_HOST` values are rejected before discovery or mutation;
- target resolution requires both Compose project `chaos-harness` and the exact requested
  service, followed by the explicit `chaos-target=true` label;
- PostgreSQL, Redis, Prometheus, Toxiproxy, the sink, and the outbox relay are not direct
  FS-1 targets;
- dry-run performs resolution without mutation, while every real mutation registers an
  idempotent revert first;
- the experiment lock prevents two local runners from mutating the stack concurrently;
- all published service ports bind to loopback.

## Operator and CI rules

- Run only reviewed experiment configuration and code. Do not run untrusted pull-request
  code on a persistent self-hosted runner that exposes its Docker socket, repository
  credentials, or production secrets.
- The checked-in GitHub workflow uses an ephemeral hosted runner, read-only repository
  permission, local Compose resources, and no deployment credentials. Cleanup runs even
  after failure.
- Never set `DOCKER_HOST` to a remote daemon to make an experiment convenient. Copy the
  project to an isolated local/ephemeral host instead.
- Never expose an unauthenticated Docker TCP API. Loopback TCP is accepted only for a
  locally controlled development daemon.
- Keep the source-of-truth database and evidence stores outside direct mutation unless a
  reviewed ADR defines how verification survives their loss.
- After interruption, inspect service state and registered fault surfaces before removing
  `.chaos-experiment.lock`. The lock is a symptom, not proof that cleanup completed.

These controls make the portfolio safer for its declared local scope; they do not turn
Docker API access into a least-privilege capability.
