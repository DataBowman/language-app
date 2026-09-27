# Architecture

## 1. Goals and constraints

| # | Requirement | What it means for the design |
|---|---|---|
| G1 | Runs on iPhone and Android | One cross-platform codebase (Expo / React Native) |
| G2 | Two roles, two experiences | One app with role-based navigation, backed by role-based access rules on the server |
| G3 | AI-generated lessons | The server calls the LLM; output is checked against a schema; the tutor approves it before the student sees it |
| G4 | Input is mainly audio, video and pictures | Media is recorded on the device, compressed, queued, and uploaded in the background |
| G5 | Track progress | Append-only log of attempts; progress is calculated from it, never edited by hand |
| G6 | Long-lived and open source | Open standards (Postgres, SQL migrations, JSON Schema) and no hard lock-in to one vendor |
| G7 | Lowest cost | Free tiers, the phone's own TTS, and an optional on-device speech-to-text model |
| G8 | Security matters | No public sign-up, row-level security, secrets kept only on the server, private media storage |
| G9 | Data loss is hard to recover from | Immutable records, idempotent uploads, nightly off-site backups that are regularly test-restored |

Privacy is **not** a primary constraint. That lets us use hosted AI APIs freely. It does not relax G8.

## 2. System overview

```
┌──────────────────────────── Device (iOS / Android / web) ────────────────────────────┐
│                                                                                       │
│  UI layer (screens)      Student screens            Tutor screens                     │
│        │                 lesson player, recorder    lesson editor, review, dashboard  │
│        ▼                                                                              │
│  Domain layer            packages/core — pure TypeScript, no I/O                      │
│  (shared, tested)        lesson schema, scoring, FSRS scheduling, progress maths      │
│        │                                                                              │
│        ▼                                                                              │
│  Data layer              Repositories ──► local SQLite (source for the UI)            │
│                               │                                                       │
│                               └──► Sync engine: outbox (push) + pull by timestamp      │
│                          MediaStore: local files ──► background upload queue          │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │ HTTPS + user JWT (Supabase client)
┌───────────────────────────────────────▼───────────────────────────────────────────────┐
│ Supabase (managed; can be self-hosted later)                                          │
│   Auth ── invite-only, email magic link / OTP                                         │
│   Postgres ── tables + Row Level Security (RLS) + SQL migrations kept in git          │
│   Storage ── private buckets: lesson-media, attempt-media (reached via signed URLs)   │
│   Edge Functions (Deno/TS) ── the only place that holds AI API keys                   │
│       generate-lesson   assess-attempt   transcribe (optional)                        │
└───────────────┬───────────────────────────────────────────────┬───────────────────────┘
                │                                               │
        ┌───────▼────────┐                             ┌────────▼─────────────────────┐
        │ AI providers   │                             │ Backups (GitHub Action,      │
        │ LLM, Whisper   │                             │ nightly): pg_dump + media    │
        └────────────────┘                             │ → R2/B2, kept 30+ days       │
                                                       └──────────────────────────────┘
```

## 3. Separation of concerns

The layers depend on each other in one direction only: **UI → domain → data → platform**.

| Layer | Location | May depend on | Must not |
|---|---|---|---|
| UI | `apps/mobile/app/**` | domain, repositories (via hooks) | talk to Supabase or SQLite directly |
| Domain | `packages/core` | nothing except `zod`, `ts-fsrs` | do any I/O. This keeps it 100% unit-testable and reusable in edge functions |
| Data | `apps/mobile/src/data/**` | domain, SQLite, Supabase client | contain business rules |
| Server | `supabase/functions/**`, `supabase/migrations/**` | domain (shared lesson schema) | trust any input from the client |

Two interfaces keep vendors swappable:

- **`MediaStore`**: `put(localUri) → mediaId`, `getUrl(mediaId)`. It starts on Supabase Storage and can move to R2/S3 later without touching the UI.
- **`AiProvider`** (server side): `generateLesson(spec)`, `assess(attempt)`, `transcribe(audio)`. It starts with one LLM vendor. Swapping vendors or models is a config change.

### Planned repository layout

```
language-app/
├── apps/
│   └── mobile/                 Expo app (iOS, Android, web for the tutor dashboard)
│       ├── app/                expo-router screens: (student)/…, (tutor)/…, (auth)/…
│       └── src/
│           ├── data/           SQLite repositories, sync engine, MediaStore
│           ├── media/          recorder, camera, compression
│           └── ui/             shared components
├── packages/
│   └── core/                   lesson schema (zod), scoring, FSRS, progress: pure TS
├── supabase/
│   ├── migrations/             versioned SQL (schema + RLS), the only way the schema changes
│   ├── functions/              edge functions: generate-lesson, assess-attempt, transcribe
│   └── seed.sql                development seed data
├── tools/
│   └── backup/                 backup + restore-test scripts
├── .github/workflows/          CI (typecheck, lint, tests, migration check) + nightly backup
└── docs/
```

A pnpm workspace monorepo lets the app, the edge functions and the tests all share one copy of the lesson schema. The lesson format is the contract between the AI, the tutor and the student, so it must never exist in two diverging copies.

## 4. What runs on the device and what runs on the server

| Concern | Where | Why |
|---|---|---|
| Showing lessons, playing media | **Device** (from local SQLite + file cache) | Works offline and loads instantly |
| Recording audio, video, photos | **Device** | Compressed before upload (audio: AAC/Opus around 32–64 kbps; video: 720p, short clips) |
| Text-to-speech for model answers | **Device** (`expo-speech`, the OS's Spanish voices) | Free, offline, good quality on both platforms |
| Speech-to-text | **Device first** (`whisper.rn`, small model), **server fallback** | Free on the device; the server gives better accuracy when needed |
| Instant scoring (multiple choice, matching, word order) | **Device** (`packages/core`) | Deterministic, no network needed |
| AI lesson generation | **Server** (edge function) | Keeps the API key off the phone; enforces rate and cost limits; validates output |
| AI assessment of speech, pictures, free answers | **Server** (edge function) | Same reasons; the result is stored with the attempt |
| Source of truth for all data | **Server** (Postgres) | Backed up; the device copy is a cache plus an outbox |
| Progress and analytics | **Server views**, cached on the device | Calculated from the attempt log, so it can always be rebuilt |

### Offline-first sync (kept deliberately simple)

A general-purpose sync engine (CRDTs, PowerSync, etc.) would be overkill here. This app's ownership rules make sync easy:

1. **Every record has one author.** The tutor writes lessons, assignments and feedback. The student writes attempts and media. Two people never edit the same row, so **conflicts cannot happen**.
2. **Client-generated UUIDs + idempotent upsert.** A retried upload never creates a duplicate.
3. **Push:** local writes go into an `outbox` table first. A background worker drains it in order and deletes each entry only after the server confirms.
4. **Pull:** `select … where updated_at > last_pulled_at` for each table the user can see (RLS filters it).
5. **Media:** stored as a local file first. The upload records its SHA-256 hash. The attempt row only points at media the server has confirmed. A half-uploaded file is simply retried.

## 5. Key flows

### 5.1 Generating a lesson (tutor)

```
Tutor fills in: topic, CEFR level, focus (e.g. "preterite vs imperfect"), exercise types
   │
   ▼
Edge function generate-lesson
   ├─ adds context: the student's weak vocabulary/grammar (from the attempt log + FSRS state)
   ├─ calls the LLM with the JSON schema for the lesson format (structured output)
   ├─ validates the reply with the zod LessonContent schema; one retry if invalid
   ├─ stores it as lessons(status='draft', version=1, generation metadata: model, prompt hash)
   └─ applies a rate limit (e.g. max N generations per day) → protects against a surprise bill
   │
   ▼
Tutor reviews and edits in the app → publishes (the published version is immutable)
   │
   ▼
Student's device pulls the lesson and prefetches its media
```

AI output is **never shown to the student without the tutor's approval**. This guards against wrong Spanish and wasted sessions.

### 5.2 Doing a lesson (student)

```
Exercise prompt (picture / audio / video / text)
   → student answers by speaking, recording video, or taking a photo
   → attempt row + media file written locally (instant; works offline)
   → outbox uploads the media, then the attempt
   → server trigger/function: transcribe → AI assessment → stores `assessment` on the attempt
   → the tutor sees it in the review queue, listens, and adds feedback
   → FSRS updates the review schedule for the vocabulary items involved
```

### 5.3 Tutor dashboard

This reads **server-side SQL views** built on `attempts`: accuracy by skill and by grammar topic, speaking time per week, overdue review items, streaks. The tutor can use it on a phone or as a web page (Expo web). A laptop screen is usually more comfortable for review.

## 6. Security

| Threat | Control |
|---|---|
| A stranger signs up | **Public sign-up disabled** in Supabase Auth. Accounts are created by invitation only |
| A user reads or writes another user's data | **Row Level Security on every table**, deny by default. A CI test runs queries as the student and as the tutor and checks each policy |
| API keys taken from the app | The app only has the Supabase *anon* key, which is safe to publish because RLS is on. AI keys and the service-role key live **only** in edge-function secrets or GitHub secrets |
| Media URLs leak | Private buckets; short-lived signed URLs |
| AI bill abuse, or a bug in a loop | Per-user rate limits in edge functions; a spend cap set in the AI provider's console |
| Stolen phone | Supabase session tokens kept in `expo-secure-store` (Keychain/Keystore), not in plain storage |
| Vulnerable dependencies | Dependabot / Renovate, and a lockfile committed to git |
| Accidental destructive migration | Migrations reviewed in PRs; CI applies them to a scratch database; the nightly backup runs before any production migration |

## 7. Data integrity and recovery

Design rules, from most to least important:

1. **Append-only facts.** `attempts`, `assessments`, `feedback` and `media` are never updated in place. A correction is a new row. Progress is *calculated* from these rows, so a bug in the progress logic can be fixed and everything recalculated without any data loss.
2. **Immutable published lessons.** Editing a published lesson creates `version + 1`. Attempts point at `(lesson_id, version)`, so past results stay meaningful.
3. **Soft delete only** (`deleted_at`), plus an `audit_log` table filled by triggers for the tutor-editable tables.
4. **Idempotent writes everywhere** (client UUIDs, content hashes), so retries are always safe.
5. **Backups (3-2-1):**
   - Nightly GitHub Action: `pg_dump` (logical, gzip) + copy of new media objects → Cloudflare R2 or Backblaze B2 (free/cheap, not the same vendor as the primary).
   - Keep daily backups for 30 days and monthly backups for 12 months.
   - **Monthly restore test**: CI restores the latest dump into a throwaway Postgres and runs sanity queries (row counts, latest attempt date). An untested backup does not count as a backup.
   - The nightly job also keeps a free-tier Supabase project active (free projects pause when idle).
6. **Schema only changes via migrations in git.** No manual changes in the dashboard, so the database can always be rebuilt from `supabase/migrations`.
7. **The device keeps un-uploaded data** until the server confirms it. If the app crashes mid-upload, the next launch finishes the job.

## 8. Main risks and open points

| Risk | Mitigation |
|---|---|
| iOS distribution needs the Apple Developer Program ($99/yr) | Needed for TestFlight. Alternatives: the tutor uses the web build; or a PWA-only phase first (see [COSTS.md](COSTS.md)) |
| Supabase free-tier limits (1 GB storage, pausing when idle, no usable backups) | Our own backups; compressed media; moving media to R2 later behind `MediaStore`; Pro plan if it outgrows the free tier |
| Pronunciation scoring quality | Start with transcript comparison + LLM feedback; the tutor's human review is the real authority |
| AI produces incorrect Spanish | Tutor approval step; schema validation; the prompt asks for simple, checkable content |
| Over-engineering for 2 users | Only one app, one backend, no microservices, no custom servers to maintain |
