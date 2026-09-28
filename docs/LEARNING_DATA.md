# Learning data: what we record, and what it will power

> Decision: [ADR 0009](adr/0009-learning-event-ledger.md). Schema: `packages/core/src/events.ts`. Table: `learning_events` (migration `20260928000000_learning_events.sql`).

## 1. The rule: record facts now, decide features later

We don't need to build every feature now, but **we cannot go back and record what already happened.** If the app does not note that the student replayed an audio clip three times, or chose "se levanta" instead of "me levanto", that information is gone for good.

So:

1. **Record raw, small facts at the moment they happen**, even if nothing uses them yet. A fact looks like "exercise X shown at 10:02:03", "answered 'se levanta' after 7.4 s, wrong", or "tapped *madrugar* for its meaning".
2. **Never edit or delete facts.** A correction is a new fact (ADR 0005).
3. **Calculate everything else** from the facts: scores, mastery, "words I know", streaks, pace. Calculations can be changed and re-run over the whole history at any time. A stored "score" column cannot.
4. **Tag every fact with what it is evidence of**: the curriculum objectives and the specific words (lemmas). This is what later answers "which words and concepts are understood".

Storage cost is trivial. Two people generate a few hundred small events a day, which is well under 50 MB a year.

## 2. What we record (event catalogue v1)

Every event has the same **envelope**:

| Field | Why |
|---|---|
| `id` (UUID made on the device) | Uploading twice never creates a duplicate |
| `type`, `v` (payload version) | The payload shape can evolve without breaking old events |
| `userId` | Set from the login token on the server; the device cannot fake it |
| `sessionId` | Groups events into a study session |
| `occurredAt` (device clock) + `receivedAt` (server clock) | Real timing even offline; also detects wrong device clocks |
| `seq` (per-device counter) | Exact order, even if two events share a millisecond |
| `deviceId`, `platform`, `appVersion` | Separates "this is hard" from "this is broken on Safari" |
| `tzOffsetMin` | Local time of day, for habit and timing features |

And a **context** for anything about an exercise: `lessonId`, `lessonVersion`, `exerciseId`, `exerciseType`, `objectiveIds[]`, `lemmas[]`, `mode`. With this, every answer can be traced back to the exact version of the exact content.

| Group | Event | Key fields |
|---|---|---|
| **Session** | `session_started` | mode, planned seconds, entry point (home / notification / review) |
| | `session_paused` / `session_resumed` | reason (app backgrounded, call, tab hidden) |
| | `session_ended` | outcome: `completed` / `abandoned` / `timed_out`, active seconds |
| **Exercise** | `exercise_presented` | context |
| | `exercise_answered` | the **actual answer given** (option index or text), correct / partial / wrong, score 0–1, **latency ms** (shown → first input → submit), try number, answer class (e.g. *accent only*), error tags, **option error tag** for a chosen wrong option |
| | `exercise_skipped` | seconds spent before skipping |
| | `hint_revealed` | which hint, seconds after it was shown |
| | `audio_replayed` | count so far, whether slowed down |
| | `gloss_looked_up` | **the word tapped for its meaning**: a strong "I don't know this word" signal |
| | `recording_submitted` | media id, duration, number of re-records |
| | `self_rated` | flashcard again / hard / good / easy, or a confidence rating |
| **Assessment** | `assessment_recorded` | source `ai` / `tutor`, score, transcript, per-objective scores, error tags, words per minute, pause ratio, model id (for AI) |
| **Learner voice** | `session_rated` | too easy / about right / too hard, enjoyed yes / no, optional note |
| | `content_reported` | "this looks wrong" + reason, per exercise |
| | `practice_logged` | study **outside the app** (conversation, series, podcast, reading) with minutes |
| **Tutor** | `tutor_observation` | objectives or words observed in a live lesson: `struggling` / `progressing` / `secure`, note, minutes |
| **Product** | `screen_viewed` | route: which parts of the app are actually used |

Not recorded on purpose:
- keystrokes, continuous location and background audio. They don't help learning, and they add risk.
- anything sent to third-party analytics. The data stays in our own database (the Content-Security-Policy blocks outside scripts anyway).

## 3. What these facts will power

| Future feature | Built from |
|---|---|
| **Spaced repetition** (FSRS) scheduling | `exercise_answered` / `self_rated` per lemma, with timestamps; latency sharpens "hard" vs "good" |
| **"Words I know" map** and the known-word list used by quality check Q3 | Correct recalls, exposures (`exercise_presented`), lookups (`gloss_looked_up`), time since last success |
| **Misconception detection** ("confuses ser and estar"; "uses 3rd person for 1st") | Chosen wrong options with their error tags; typed-answer classification; AI/tutor error tags |
| **Targeted mini-lessons** on persistent errors | The same error tag repeating across days |
| **Accent vs knowledge**: not penalising *esta* for *está* as a vocabulary failure | Answer class `accent_only` |
| **Fluency / automaticity trend** | Latency on correct answers going down over time; speaking words-per-minute and pause ratio |
| **Listening difficulty** | Audio replays, slowed playback, `listen_choose` accuracy |
| **Readiness for more immersion** | Hint and gloss use falling over time |
| **Pace and deadline projection** | Active seconds per session + `practice_logged` minutes vs objectives mastered |
| **Best time and length to study**; smart reminders | Session start times (local), completion vs abandonment by time of day and length |
| **Drop-off diagnosis** ("the app loses them at video exercises") | `session_ended: abandoned` + the last `exercise_presented` before it |
| **Bad-content detection** | Exercises answered wrong or skipped far more than their siblings; `content_reported`; tutor edits |
| **Trust in AI grading / choosing AI providers** | AI vs tutor `assessment_recorded` on the same attempt → agreement rate per model |
| **Honest "was it too hard?" tuning** | `session_rated` vs measured accuracy |
| **Blending classroom and app** | `tutor_observation` counts as evidence alongside in-app answers |
| **Deciding which features to build next** | `screen_viewed`, mode split, completion rates, and how often each exercise type is avoided or skipped |

## 4. Derived measures (calculated, never stored as truth)

Defined in code (`packages/core/src/evidence.ts` for the first ones) and later as SQL views:

- **Per word (lemma):** exposures, recall attempts, accuracy, last correct, lookups, median latency when correct.
- **Per objective:** attempts, accuracy, distinct days practised, production evidence yes/no. This feeds mastery (CONTENT_FRAMEWORK §3).
- **Per error tag:** occurrences and trend.
- **Per session:** active time, completion, accuracy, hints per exercise.

## 5. Security and integrity

- Students can only **add** events for themselves; tutors can read their students' events; nobody can change or delete them (RLS, tested).
- Payloads are validated against the zod schema in the app. The database also rejects unknown event types and oversized payloads (16 KB).
- Events are part of the nightly backup like everything else.
- The duplicate-safe id and the device counter make offline upload and retry safe (ADR 0003).

## 6. How this changes the provisional data model

`learning_events` becomes the **raw ledger**. The earlier provisional `sessions`, `attempts` and `assessments` tables in [DATA_MODEL.md](DATA_MODEL.md) become **projections** (SQL views or rebuildable tables) over it. There is one source of truth for "what happened", and everything else can be rebuilt from it.

## 7. Open questions

1. Should the student see their own raw analytics (e.g. "you look up *madrugar* a lot"), or only curated progress?
2. Should `tutor_observation` from live lessons count towards mastery equally with in-app evidence, or only as a hint?
3. Any additional outside-the-app activities worth logging (e.g. trips, classes)?
