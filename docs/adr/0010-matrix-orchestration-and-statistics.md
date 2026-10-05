# ADR-0010: manifest-driven multi-run orchestration and statistics

- Status: accepted
- Date: 2026-10-05

## Context

A single chaos run proves that an experiment is wired, but it cannot support a latency
distribution or reliability-rate claim. Repetition must also vary workload seeds and
fault timing without becoming irreproducible. A long matrix must not start a new run
while a previously restarted service is only running rather than ready.

## Decision

Use a versioned YAML matrix manifest. Every listed experiment has at least ten repeats.
The manifest must include a no-fault control and all required fault classes. The matrix
owns repetition; source experiment files keep `repeat: 1`.

Each repeat uses the source seed plus its zero-based repeat index. Faulted experiments
also receive a deterministic pseudorandom injection offset inside the manifest's
declared range. This gives varied timing while keeping the exact schedule reproducible
from the manifest, seed, and repeat index.

Runs execute serially through the existing repository lock. Between repeats, the matrix
waits for API readiness, metrics-proxy health and clean corruption mode, webhook-sink
health, and Prometheus readiness. Every underlying run keeps its normal evidence
directory and run ID.

The report generator writes aggregate JSON and Markdown. It uses the arithmetic middle
for median and nearest-rank p90. Null MTTD/MTTR values are excluded and counted as
missing; they are never converted to zero. Invariant output preserves `pass`,
`report`, and `fail`, and reports both strict pass rate and non-failure rate.

Coverage completeness and experiment outcome are separate. A matrix can be complete
while reporting invariant failures. Complete coverage with failures exits with code 2
after writing the report; incomplete coverage exits with code 1.

## Consequences

- One command can reproduce the complete implemented matrix and its controls.
- Published timing statistics link to every contributing run ID.
- Expected report-only duplicates remain distinguishable from invariant failures.
- Matrix runs are intentionally serial and may take substantial time.
- Telemetry state events remain separate from application anomaly events, so MTTD is
  honestly missing for fault classes that emit no `anomaly_detected` event.
