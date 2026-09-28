# 0014: Learner context is data, never an assumption; plan changes apply automatically

Date: 2026-10-01 · Status: Accepted · Resolves: CONTENT_FRAMEWORK §10 · Amends: CONTENT_FRAMEWORK §6 (plan approval)

## Context
The content framework listed open questions: variety, starting level, goal and deadline, time budget, reference curriculum, and AI autonomy. The owner's answer is that these must be treated as **unknown at all times**: the language variety is *selected*, the level is *dynamically configured*, and the goal is *selectable*. For AI autonomy: **no approval needed** for plan changes.

## Decision
- **Settings, not constants.** `learner_settings` holds the target language, variety, weekly minutes, quick/immersive share, plan autonomy and UI language. Every value can be NULL, meaning "not known yet". `effectiveContext` in `packages/core` fills unknowns from one shared set of defaults (neutral Spanish `es`, 60 min/week, 40% quick) and reports which values were **assumed**, so the UI can say "we're still learning this". Learner and tutor can both change settings at any time.
- **Neutral variety.** `es` is a valid variety. Content in `es` avoids region-specific forms, and quality check Q7 flags vosotros and voseo in neutral lessons. Choosing a variety later only changes what is generated from then on.
- **Target language is data** (`targetLanguage`, currently only `es`). Adding a language means adding a language pack (curriculum, variety markers, error tags), not changing the app.
- **Level is derived, continuously.** `estimateLevels` works out a level per skill from the curriculum graph and each objective's own mastery criteria. A level counts as reached when 70% of its objectives are mastered, and a tutor's "secure" or "struggling" mark overrides app evidence. It returns a confidence value (how much of the working level has evidence at all). There is no placement test to get "right" up front: the estimate moves as evidence arrives.
- **Goals are selectable.** A goal is a challenge, a target level, or a custom description, optionally with a target date. A learner can have several goals with at most one active (enforced by the database). Goals can be paused, achieved or dropped.
- **Curriculum** is bundled, versioned content (`packages/core/content/es/objectives.json`, 29 A1–A2 objectives, variety-neutral, based on CEFR + PCIC), validated on load. It covers every objective the challenge templates use. Tutor-authored objectives can move to a table later.
- **Plan autonomy:** `plan_autonomy = 'auto'` by default. AI plan revisions apply immediately as a new plan version; the tutor is notified and can revert, which creates another new version. Setting `tutor_approval` restores approval.

## Consequences
- No code path may assume a variety, level, goal or time budget. Tests cover the all-unknown case.
- Plans can change without anyone in the loop. Because plans are versioned and every revision records its rationale, any change can be inspected and reverted.
