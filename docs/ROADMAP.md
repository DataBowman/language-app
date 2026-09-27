# Roadmap

Each phase ends with something usable. Security and backups come **first**, before there is any data to lose.

## Phase 0: Foundation
- [ ] pnpm monorepo: `apps/mobile` (Expo + expo-router + TypeScript strict), `packages/core`
- [ ] CI: typecheck, lint, unit tests, `supabase db` migration check against a scratch Postgres
- [ ] Supabase project; public sign-up **disabled**; two invited accounts (student, tutor)
- [ ] Migration `0001_init.sql`: tables and RLS from [DATA_MODEL.md](DATA_MODEL.md), plus RLS tests
- [ ] Nightly backup workflow (pg_dump + media → R2/B2) and a monthly restore-test workflow
- [ ] Login screen, role-based navigation shell (student tabs / tutor tabs), secure session storage

## Phase 1: Minimum viable lesson loop
- [ ] `LessonContent` zod schema + lesson player for `listen_repeat`, `multiple_choice`, `describe_image`
- [ ] Local SQLite + outbox sync; audio recording + background upload through `MediaStore`
- [ ] Tutor: create or edit a lesson by hand, attach photos, assign it to the student
- [ ] Tutor: review queue, where they listen to recordings and leave text/voice feedback
- **Outcome:** real lessons between the student and tutor, with no AI yet

## Phase 2: AI
- [ ] `generate-lesson` edge function (structured output → validation → draft) with rate limit
- [ ] Transcription (on-device whisper first, server fallback) and `assess-attempt` AI feedback
- [ ] Tutor draft review / publish flow

## Phase 3: Progress and retention
- [ ] FSRS review items taken from lesson vocabulary; daily review session
- [ ] Tutor dashboard views: skills, activity, weak areas; the student sees their own progress
- [ ] Generated lessons target the student's weak areas

## Phase 4: Richer media and polish
- [ ] Video responses (compressed on the device, length-limited)
- [ ] Push notifications (lesson assigned, feedback ready)
- [ ] Move media to R2 if Supabase storage limits are reached
