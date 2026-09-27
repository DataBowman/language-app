# 0005: Append-only facts and independent backups

Date: 2026-09-27 · Status: Accepted

## Context
Losing or corrupting the student's history (recordings, attempts, progress) would be very hard to recover from. The free tier has no backups we can rely on.

## Decision
- `attempts`, `assessments` and `media` are append-only (RLS allows no update/delete). Progress is a derived SQL view, never a stored counter.
- Published lessons are immutable; an edit creates a new version.
- Soft deletes plus an `audit_log` filled by triggers.
- A nightly GitHub Action copies a `pg_dump` and new media to R2/B2 (a different vendor). Daily backups are kept for 30 days and monthly ones for 12 months.
- A monthly automated restore test into a scratch Postgres. It fails loudly if the backup cannot be restored.
- A manual backup is taken before every production migration.

## Consequences
Storage grows slowly over time, which is fine at this scale. Any bug in the derived data can be fixed and recalculated from the raw facts.
