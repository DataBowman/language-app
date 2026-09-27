# Roadmap

Each phase ends with something usable. Security and backups come **first**, before there is any data to lose. The browser is supported from Phase 0; it is not added later ([ADR 0006](adr/0006-browser-as-first-class-platform.md)).

## Phase 0: Foundation
- [ ] pnpm monorepo: `apps/mobile` (Expo + expo-router + TypeScript strict, **iOS/Android/web**), `packages/core`
- [ ] Platform adapter interfaces (`LocalDb`, `Recorder`, `SpeechToText`, `TextToSpeech`, `SecureSession`, `BackgroundSync`) with native + web stubs; a lint rule that stops platform modules being imported outside `src/platform`
- [ ] i18n set up (en + es), because immersive mode switches the UI to Spanish
- [ ] CI: typecheck, lint, unit tests, **web build + Playwright smoke test**, migration check against a scratch Postgres
- [ ] Web deploy (Cloudflare Pages / GitHub Pages) with HTTPS, strict CSP and a PWA manifest
- [ ] Supabase project; public sign-up **disabled**; two invited accounts (student, tutor); Auth redirect URLs + CORS limited to our origins
- [ ] Migration `0001_init.sql`: tables and RLS from [DATA_MODEL.md](DATA_MODEL.md) (including `sessions`), plus RLS tests
- [ ] Nightly backup workflow (pg_dump + media → R2/B2) and a monthly restore-test workflow
- [ ] Login screen, role-based navigation shell; student home with **Quick** and **Deep** entry points

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

## Phase 3: AI
- [ ] `generate-lesson` edge function (mode-aware: immersive lessons or quick drill packs) → validation → draft, with rate limit
- [ ] `transcribe` edge function (the only speech-to-text on the web; fallback on native) + on-device whisper on native
- [ ] `assess-attempt` AI feedback on immersive answers; tutor draft review / publish flow
- [ ] Optional `conversation` exercise (turn-based AI role-play)

## Phase 4: Progress
- [ ] Dashboard views split by mode: immersive quality vs quick retention
- [ ] Generated lessons target the student's weak areas from both modes

## Phase 5: Richer media and polish
- [ ] Video responses (compressed on the device / MediaRecorder, length-limited)
- [ ] Push notifications (native; web push optional)
- [ ] Move media to R2 if Supabase storage limits are reached
