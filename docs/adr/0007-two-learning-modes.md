# 0007: Two learning modes (immersive deep and quick shallow) in one app

Date: 2026-09-27 · Status: Accepted · Amends: 0003 (new writer: sessions), 0004 (AI conversation)

## Context
The student wants two ways to study:
- **Immersive / deep**: long, focused sessions of 20–45 minutes. Spanish only. Speaking, video, describing pictures, conversation. Reviewed by the tutor.
- **Quick / shallow**: 2–5 minute bursts on the go. Vocabulary and phrase recall, listening checks. Instant feedback, no tutor involved.

## Options
- **Two separate apps**: duplicates login, sync and content, and splits progress. Rejected.
- **Two unrelated content stores**: the tutor would have to write everything twice. Rejected.
- **One content pool, two session types**: chosen.

## Decision
- **Immersive sessions** play an authored `Lesson` from start to finish (AI-generated, approved by the tutor). The UI switches to Spanish for the session (i18n is built in from day one). Translations are hidden behind a "hint" tap, and hint use is recorded. Answers are mostly spoken or recorded on video. They get an AI assessment and go into the tutor's review queue.
- **Quick sessions** are **assembled on the device** by a pure `SessionComposer` in `packages/core`. It takes FSRS-due `review_items` and short auto-scorable drills taken from the vocabulary and exercises of published lessons, then fills a time budget (e.g. 3 min). They need no LLM at runtime, are fully offline-capable, give instant feedback, and do **not** go into the tutor's review queue.
- Each exercise type declares its **mode suitability** and whether it is **auto-scorable** (for example, `multiple_choice` suits both modes; `video_response` is immersive only; quick mode only uses auto-scorable types).
- A new `sessions` table (written by the student) records mode, start/end and the planned vs actual length. Attempts point at their session, so progress can be split by mode.
- Both modes feed the same FSRS items: immersive lessons *introduce* items, and quick sessions *maintain* them. This is how the two modes reinforce each other.
- Optional immersive exercise `conversation`: a turn-based role-play (record → speech-to-text → LLM reply → text-to-speech). It is server-side and rate-limited, like all AI (ADR 0004).

## Consequences
- Quick mode is cheap: it uses no AI and no tutor time. It can ship before the AI features.
- The dashboard shows two kinds of progress: **retention/breadth** (quick: recall accuracy, items mastered, streak) and **production quality** (immersive: speaking scores, tutor ratings, fluency trend).
- Immersive lessons with video are large, so they are downloaded as a "lesson pack" before they start (on Wi-Fi when native; the web shows a download progress bar).
