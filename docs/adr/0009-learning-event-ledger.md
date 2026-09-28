# 0009: A learning event ledger: record raw facts now, derive features later

Date: 2026-09-28 · Status: Accepted · Amends: DATA_MODEL (sessions/attempts/assessments become projections)

## Context
Features we will want later depend on behavioural detail we can only capture at the moment it happens: spaced repetition, a "words I know" map, misconception detection, fluency trends, pace projections, drop-off analysis and choosing which features to build next. Data that was never recorded cannot be recovered. At the same time, we should not build those features now.

## Decision
- One append-only table, `learning_events`, holds small, typed facts: session start/pause/end, exercise shown/answered/skipped, hints, audio replays, word lookups, recordings, self-ratings, AI/tutor assessments, the learner's own ratings and reports, practice outside the app, tutor observations from live lessons, and screen views. See [LEARNING_DATA.md](../LEARNING_DATA.md) for the catalogue.
- Every exercise-related event carries the exact content version, the objectives **and the words (lemmas)** it is evidence of. Lessons tag each exercise with its lemmas, and wrong options with the misconception they reveal.
- Payload shapes live in `packages/core/src/events.ts` (zod, versioned per type). The database enforces the envelope, the list of types, size limits, who may write what (RLS), and immutability (a trigger blocks UPDATE/DELETE/TRUNCATE even for admins).
- Everything else is **derived**: scores, mastery, known words, streaks, pace. Derivations are pure code or SQL views and can be changed and re-run over the full history. `summarizeEvidence` in `packages/core` is the first one.
- The provisional `sessions`, `attempts` and `assessments` tables become projections of the ledger rather than separate sources of truth.
- No third-party analytics. The data stays in our database and our backups.

## Consequences
- Future learning features need new calculations, not new data collection, and they work on the history from day one.
- The event schema must be versioned with care: add optional fields freely, and bump `v` when a meaning changes. A unit test keeps the TypeScript and SQL type lists in sync.
- Deleting a user's history is a deliberate, reviewed migration, never an accident (`on delete restrict` + the immutability trigger).
