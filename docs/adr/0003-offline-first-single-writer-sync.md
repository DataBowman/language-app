# 0003: Offline-first, single-writer sync

Date: 2026-09-27 · Status: Accepted (amended, see README)

## Context
Lessons are done on phones, sometimes with a poor connection. Recordings must never be lost if the network drops or the app crashes.

## Decision
- The UI reads and writes local SQLite. Server Postgres is the source of truth.
- Each record type has exactly one writer (the tutor writes lessons, assignments and feedback; the student writes attempts, media and review items). So there are no merge conflicts, and we need no CRDT or third-party sync engine.
- Client-generated UUIDs + idempotent upserts; an `outbox` table is drained in order; an entry is removed only when the server confirms it.
- Media is saved locally first and uploaded with a SHA-256 hash. The attempt is sent only after its media is confirmed.
- Pull uses `updated_at > last_pulled_at` for each table (filtered by RLS).

## Consequences
This is simple and easy to test. If we ever need true multi-writer editing (two tutors editing one lesson), we will revisit this with a new ADR.
