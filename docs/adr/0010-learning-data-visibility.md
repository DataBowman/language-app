# 0010: Who sees learning data: curated for the student, everything for the tutor and the tutor's AI

Date: 2026-09-29 · Status: Accepted · Amends: 0008 (MCP resources are scoped by the caller), 0009 (read access)

## Context
The student wants a curated progress view, not raw analytics. The tutor should see everything, and should be able to ask an AI questions with the analytics as context ("what should we focus on this week?", "why is ser/estar not sticking?").

## Decision
- **Student:** cannot read the raw `learning_events` ledger, not even their own rows (RLS, migration 0003, tested). They see a **curated progress view** computed on the server from the same evidence (`buildStudentProgress` in `packages/core`):
  - their streak, practice minutes this week and active days,
  - words practised and words that are strong,
  - practice outside the app,
  - each challenge with its readiness and next step,
  - the tutor's feedback.
  It never shows error counts, look-ups or response times. Students still *write* their own events.
- **Tutor:** reads every event about their own students, and their own records.
- **AI:** has no access of its own. The MCP server resolves every resource and tool **with the caller's identity** (their JWT under RLS). So the tutor's AI sees exactly what the tutor sees, and anything the student uses sees only the curated view. Tutor-facing MCP additions to ADR 0008:
  - Resources: `learner://{id}/analytics` (evidence summary: per word, objective and error, activity by day), `learner://{id}/tutored-sessions` (recent live-session logs and observations).
  - Tools: `query_learner_events(type?, from?, to?, objectiveId?, lemma?, limit≤500)`, `suggest_tutored_session(learnerId)`, `challenge_readiness(learnerId, challengeId)`.
  - Prompts: `prepare_tutored_session`, `weekly_summary_for_tutor`, `explain_struggle(objectiveId | errorTag)`.
- Retried uploads use a plain INSERT, and the upload queue treats a duplicate-key error on the event's own id as "already delivered". `ON CONFLICT` needs read access, which learners no longer have.

## Consequences
- The curated view needs a small server function (edge function running `packages/core`), because the student's device cannot compute it from raw events it cannot read.
- The student is also the project owner and can read everything through the Supabase dashboard. This curation is a product choice for the app, not a secret from the owner.
- The same RLS rules protect data whether a person or an AI is asking.
