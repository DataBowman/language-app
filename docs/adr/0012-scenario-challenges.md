# 0012: Scenario challenges: real-world goals the curriculum works towards

Date: 2026-09-29 · Status: Accepted · Amends: CONTENT_FRAMEWORK §2 (goal model)

## Context
The student wants concrete things to aim for, such as "say hello to a Spanish colleague" or "travel to a Spanish-speaking country". These are more motivating than CEFR levels, and they say exactly what to learn.

## Decision
- A **challenge** is a real scenario split into **steps**. Each step links to curriculum **objectives**, key phrases, an optional in-app **rehearsal** (e.g. an AI role-play), and plain-language **success criteria**. Schema: `Challenge` in `packages/core/src/challenges.ts`. Two starter templates ship: *Greet a Spanish-speaking colleague* (A1) and *Travel to a Spanish-speaking country* (A2).
- **Readiness is derived, never entered.** It comes from objective evidence: accuracy, weighted by days practised and capped without spoken or written production. The tutor's live judgement overrides app evidence either way. The result is a percentage, a status (not ready / getting there / ready), the next step, and the weakest objectives. The thresholds are tunable parameters.
- Challenges plug into everything else:
  - **Planner:** objectives of active challenges get priority, and a challenge can carry a target date (e.g. the trip).
  - **Tutor:** the next challenge step is first in the suggested session plan.
  - **Student:** curated progress shows each challenge's readiness and next step.
  - **AI:** can draft new challenges from the student's own description ("I'm visiting Mexico in March"); the tutor approves them like lessons.
- Lifecycle events: `challenge_started`, `challenge_rehearsed` (linked to the assessed answer), and `challenge_completed` (`real_world` or `in_app`, with a 1–5 confidence rating, reflection and optional recording). **Doing it for real is the goal**, and the reflection is valuable evidence.

## Consequences
- Challenge definitions are content: stored as tutor-approved rows (table added with the other content tables in Phase 0a/1), versioned like lessons.
- The template objective ids (`fn.greetings`, `cd.order_food`, …) are proposals for the A1–A2 curriculum seed.
