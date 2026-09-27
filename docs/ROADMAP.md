# Roadmap

Each phase ends with something usable. Security and backups come **first**, before there is any data to lose. The browser is supported from Phase 0; it is not added later ([ADR 0006](adr/0006-browser-as-first-class-platform.md)).

## Phase 0a: Content framework decisions (before the schema is final)
- [ ] Answer the open questions in [CONTENT_FRAMEWORK.md §10](CONTENT_FRAMEWORK.md) (goal, deadline, Spanish variety, starting level, reference curriculum, AI autonomy)
- [ ] Seed curriculum graph for A1–A2 (objectives + prerequisites from CEFR + PCIC), AI-drafted, tutor-reviewed, stored in `supabase/seed/`
- [ ] Define the learner snapshot and the MCP tool/resource list ([ADR 0008](adr/0008-mcp-provider-agnostic-ai.md)); accept ADR 0008
- [ ] Finalise [DATA_MODEL.md](DATA_MODEL.md) (goals, objectives, plans, mastery, generation_runs, lexicon) and `LessonContent` v1

## Phase 0b: Foundation
- [x] pnpm monorepo: `apps/mobile` (Expo SDK 57 + expo-router + TypeScript strict, **iOS/Android/web**), `packages/core`
- [x] `packages/core`: exercise-type registry, `LessonContent` v1 schema (+ JSON Schema export for any AI), curriculum graph validation, goal feasibility, deterministic quality checks: 27 unit tests
- [x] Platform adapter interfaces (`LocalDb`, `Recorder`, `SpeechToText`, `TextToSpeech`, `SecureSession`, `BackgroundSync`); `SecureSession` + `TextToSpeech` implemented; lint rule blocks platform modules outside `src/platform`
- [x] i18n (en + es); immersive screens switch the UI to Spanish
- [x] CI: typecheck, lint, unit tests, **web build + Playwright smoke test** (desktop + phone), migrations + RLS tests against Postgres 17
- [x] Web build with strict CSP headers and a PWA manifest (hosting itself: see [OPERATIONS.md](OPERATIONS.md) §5)
- [ ] Supabase project; public sign-up **disabled** (done in `config.toml`; dashboard step in [OPERATIONS.md](OPERATIONS.md)); two invited accounts
- [x] Migration `init`: profiles/roles, tutor↔student links, audit log, RLS + tests. *Content tables wait for Phase 0a.*
- [x] Nightly backup workflow + monthly restore-test workflow (scripts in `tools/backup`; activate by adding secrets)
- [x] Sign-in screen (invite-only email code), role-based navigation; student home with **Quick** and **Deep** entry points; tutor home

## Phase 1: Immersive lesson loop (no AI yet)
- [ ] `LessonContent` zod schema + exercise-type registry (with mode/auto-score metadata)
- [ ] Immersive player: `listen_repeat`, `multiple_choice`, `describe_image`; Spanish-only UI with hints; lesson-pack download
- [ ] LocalDb + outbox sync; audio recording on native **and** in the browser (MediaRecorder); upload after each exercise; sync-status indicator
- [ ] Tutor: create or edit a lesson by hand, attach photos, assign it to the student
- [ ] Tutor: review queue, where they listen to recordings and leave text/voice feedback
- **Outcome:** real deep lessons between the student and tutor, on phone or browser

## Phase 2: Quick mode + spaced repetition (still no AI; cheap)
- [ ] FSRS `review_items` created from lesson vocabulary
- [ ] `SessionComposer` in `packages/core` (due items + drills → fits a time budget), with unit tests
- [ ] Quick player: `flashcard`, `listen_choose`, `multiple_choice`, `word_order`, `type_answer`; fully offline on native
- [ ] Streaks and a simple "today" view for the student
- **Outcome:** the daily 3-minute habit, which feeds everything learned in deep lessons back to the student

## Phase 3: AI (provider-independent)
- [ ] `mcp-curriculum` server: resources, tools (`check_lesson`, `save_lesson_draft`, …), prompts
- [ ] `ai-orchestrator` + `LlmClient` with **two** adapters from the start; eval set of ~20 generation cases
- [ ] Quality checks Q1–Q10 in `packages/core`; second-opinion review by a different model
- [ ] `transcribe` edge function (the only speech-to-text on the web; fallback on native) + on-device whisper on native
- [ ] `assess-attempt` AI feedback on immersive answers; tutor draft review / publish flow
- [ ] Optional `conversation` exercise (turn-based AI role-play)

## Phase 4: Adaptive curriculum
- [ ] Mastery + velocity calculations; goal feasibility and projected completion date
- [ ] Weekly plan review + triggered re-planning (pace drift, plateau, goal change) → tutor approval
- [ ] Dashboard views split by mode (immersive quality vs quick retention) + progress against the goal

## Phase 5: Richer media and polish
- [ ] Video responses (compressed on the device / MediaRecorder, length-limited)
- [ ] Push notifications (native; web push optional)
- [ ] Move media to R2 if Supabase storage limits are reached
