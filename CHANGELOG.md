# Changelog

## Unreleased

### Documentation

- Added an application-ownership curriculum covering the hardest design challenges,
  deep interview and debugging questions, progressive rebuild labs, incident drills, and
  an evidence-based ownership checklist.

## 1.0.0 — 2026-10-05

First feature-complete local release.

### Managed payment system

- Idempotent payment API with PostgreSQL as source of truth.
- Database-enforced positive amounts, append-only double-entry ledger, and deferred
  balance validation.
- Transactional webhook outbox, deterministic BullMQ publication, retrying worker,
  webhook sink, and dead-letter path.
- Prometheus RED metrics routed through an independently faultable metrics proxy.

### Chaos and recovery

- FS-1 service kill/stop/pause/restart, FS-2 five-mode telemetry corruption, FS-3 sensor
  outage, and FS-4 allowlisted Toxiproxy latency/timeout/reset faults.
- Local-only target validation, mutation labels, dry-run, single-run lock, hard deadline,
  error-rate abort, signal handling, and reverse-order cleanup.
- Rule-based MAPE-K controller with PostgreSQL policy, hysteresis, cooldown, restart
  budget, blind mode, corrupt-telemetry guard, and explicit response events.

### Evidence and findings

- Seeded open-loop load, run-isolated identities, JSONL journals, I1-I6 verification,
  response timing, per-run reports, and N>=10 aggregate statistics.
- Day 17 completed 130/130 planned runs; Day 18 completed 30/30 gap runs.
- Genuine F-001 event-loss finding fixed by the transactional outbox and verified with
  unchanged before/after configuration.
- Genuine F-002 evidence-contamination finding fixed by run-ID namespacing.
- Synthetic S-001 remains explicitly separate from discovered defects.

### Delivery

- Quality, live integration, and bounded chaos-smoke CI jobs with diagnostic/evidence
  uploads and cleanup.
- One-command `npm run demo`, extension scaffold, dependency review, security guidance,
  handover documentation, study guide, and preserved run artifacts.

### Known limitations

- Local Docker Compose only; no Kubernetes, production, remote daemon, or true packet
  loss support.
- Four high transitive Prisma CLI advisories remain because npm's offered fix requires an
  incompatible major downgrade.
- No license is included by explicit project decision.
