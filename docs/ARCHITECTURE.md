# Architecture

## 1. Goals and constraints

| # | Requirement | What it means for the design |
|---|---|---|
| G1 | Runs on iPhone, Android **and in a web browser** | One cross-platform codebase (Expo / React Native + Expo web). Platform-specific code sits behind adapters ([ADR 0006](adr/0006-browser-as-first-class-platform.md)) |
| G2 | Two roles, two experiences | One app with role-based navigation, backed by role-based access rules on the server |
| G3 | AI-generated lessons | The server calls the LLM; output is checked against a schema; the tutor approves it before the student sees it |
| G4 | Input is mainly audio, video and pictures | Media is recorded on the device, compressed, queued, and uploaded in the background |
| G5 | Track progress | Append-only log of attempts; progress is calculated from it, never edited by hand |
| G6 | Long-lived and open source | Open standards (Postgres, SQL migrations, JSON Schema) and no hard lock-in to one vendor |
| G7 | Lowest cost | Free tiers, the phone's own TTS, and an optional on-device speech-to-text model |
| G8 | Security matters | No public sign-up, row-level security, secrets kept only on the server, private media storage |
| G9 | Data loss is hard to recover from | Immutable records, idempotent uploads, nightly off-site backups that are regularly test-restored |
| G10 | Two learning modes: **immersive (deep)** and **quick (shallow)** | One content pool with two session types; quick sessions are assembled on the device with no AI or tutor needed ([ADR 0007](adr/0007-two-learning-modes.md)) |
| G11 | AI is interchangeable and adapts the curriculum to performance and goals | An MCP server is the only interface between data and AI; the curriculum is a graph + a re-plannable plan ([CONTENT_FRAMEWORK.md](CONTENT_FRAMEWORK.md), [ADR 0008](adr/0008-mcp-provider-agnostic-ai.md)) |

Privacy is **not** a primary constraint. That lets us use hosted AI APIs freely. It does not relax G8.

## 2. System overview

```
┌──────────────────────────── Device (iOS / Android / web) ─────────────────────────────┐
│                                                                                       │
│  UI layer (screens)      Student: Immersive player | Quick session   Tutor screens    │
│        │                 recorder, hints, Spanish UI | 3-min drills  editor, review,  │
│        │                                                             dashboard        │
│        ▼                                                                              │
│  Domain layer            packages/core — pure TypeScript, no I/O                      │
│  (shared, tested)        lesson schema, SessionComposer, scoring, FSRS, progress      │
│        │                                                                              │
│        ▼                                                                              │
│  Data layer              Repositories ──► LocalDb (source for the UI)                 │
│                               │                                                       │
│                               └──► Sync engine: outbox (push) + pull by timestamp     │
│                          MediaStore: local files ──► upload queue                     │
│        │                                                                              │
│        ▼                                                                              │
│  Platform adapters       LocalDb · Recorder · SpeechToText · TextToSpeech ·           │
│  (src/platform)          SecureSession · BackgroundSync                               │
│                          each has a .native.ts (iOS/Android) and a .web.ts version    │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │ HTTPS + user JWT (Supabase client)
┌───────────────────────────────────────▼───────────────────────────────────────────────┐
│ Supabase (managed; can be self-hosted later)                                          │
│   Auth ── invite-only, email magic link / OTP                                         │
│   Postgres ── tables + Row Level Security (RLS) + SQL migrations kept in git          │
│   Storage ── private buckets: lesson-media, attempt-media (reached via signed URLs)   │
│   Edge Functions (Deno/TS) ── the only place that holds AI API keys                   │
│       mcp-curriculum (MCP server: resources, tools, prompts; acts under RLS)          │
│       ai-orchestrator (MCP client + model adapter)   assess-attempt   transcribe      │
└───────────────┬───────────────────────────────────────────────┬───────────────────────┘
                │                                               │
        ┌───────▼────────┐                             ┌────────▼─────────────────────┐
        │ Any AI provider│                             │ Backups (GitHub Action,      │
        │ via adapter +  │
        │ tutor's own    │
        │ MCP client     │                             │ nightly): pg_dump + media    │
        └────────────────┘                             │ → R2/B2, kept 30+ days       │
                                                       └──────────────────────────────┘
```

## 3. Separation of concerns

The layers depend on each other in one direction only: **UI → domain → data → platform adapters**.

| Layer | Location | May depend on | Must not |
|---|---|---|---|
| UI | `apps/mobile/src/app/**`, `src/ui/**` | domain, repositories (via hooks) | talk to Supabase or SQLite directly |
| Domain | `packages/core` | nothing except `zod`, `ts-fsrs` | do any I/O. This keeps it 100% unit-testable and reusable in edge functions |
| Data | `apps/mobile/src/data/**` | domain, platform adapters, Supabase client | contain business rules or import platform modules directly |
| Platform | `apps/mobile/src/platform/**` | Expo/native modules, browser APIs | be imported anywhere except the data layer and media UI. **This is the only place that knows iOS/Android/web differ** |
| Server | `supabase/functions/**`, `supabase/migrations/**` | domain (shared lesson schema) | trust any input from the client |

Two interfaces keep vendors swappable:

- **`MediaStore`**: `put(localUri) → mediaId`, `getUrl(mediaId)`. It starts on Supabase Storage and can move to R2/S3 later without touching the UI.
- **MCP curriculum server + `LlmClient` adapter** (server side, [ADR 0008](adr/0008-mcp-provider-agnostic-ai.md)): all AI work goes through task-shaped MCP tools and resources. The model is reached through a thin adapter that only uses features every provider shares. Changing provider or model is configuration plus an eval run.

### Planned repository layout

```
language-app/
├── apps/
│   └── mobile/                 Expo app: iOS, Android and web (student + tutor on every platform)
│       ├── e2e/                Playwright browser tests (desktop + phone viewports)
│       ├── public/             web-only: index.html, PWA manifest, security headers (_headers)
│       └── src/
│           ├── app/            expo-router screens: sign-in, student/{index,quick,immersive}, tutor/…
│           ├── auth/           session provider (invite-only email code; dev role picker without a backend)
│           ├── lib/            Supabase client
│           ├── data/           repositories, sync engine, MediaStore (Phase 1)
│           ├── platform/       adapters: *.native.ts / *.web.ts
│           ├── media/          recording UI, camera, compression
│           ├── i18n/           UI strings (en + es; immersive mode switches the UI to es)
│           └── ui/             shared, responsive components
├── packages/
│   ├── core/                   lesson schema (zod), SessionComposer, scoring, FSRS, progress,
│   │                           quality checks, mastery + pace calculations: pure TS
│   └── ai/                     LlmClient adapters, prompt templates (versioned), eval harness
├── supabase/
│   ├── migrations/             versioned SQL (schema + RLS), the only way the schema changes
│   ├── functions/              edge functions: mcp-curriculum, ai-orchestrator, assess-attempt, transcribe
│   ├── seed/                   curriculum graph (objectives, prerequisites), lexicon
│   ├── tests/                  RLS tests run against plain Postgres (run.sh + Supabase stub)
│   └── config.toml             local Supabase config (sign-up disabled)
├── tools/
│   └── backup/                 backup + restore-test scripts
├── .github/workflows/          CI (typecheck, lint, tests, web build + Playwright, migration check),
│                               web deploy, nightly backup
└── docs/
```

A pnpm workspace monorepo lets the app, the edge functions and the tests all share one copy of the lesson schema. The lesson format is the contract between the AI, the tutor and the student, so it must never exist in two diverging copies.

## 4. What runs on the device and what runs on the server

| Concern | Native (iOS/Android) | Browser | Why |
|---|---|---|---|
| Showing lessons, playing media | **Device** (LocalDb + file cache) | **Device** (LocalDb cache + HTTP cache) | Loads instantly; native works fully offline |
| Recording audio, video, photos | **Device**, AAC/m4a | **Device**, `MediaRecorder` (MP4/AAC when supported, otherwise WebM/Opus) | Compressed before upload; the real MIME type is stored |
| Text-to-speech for model answers | OS voices (`expo-speech`) | `speechSynthesis`; falls back to server-generated audio if there is no Spanish voice | Free in most cases |
| Speech-to-text | **Device first** (`whisper.rn`), server fallback | **Server** always | There is no reliable in-browser option |
| Composing quick sessions | **Device** (`SessionComposer`) | **Device** | Pure logic, no network needed |
| Instant scoring (multiple choice, matching, word order, flashcards) | **Device** (`packages/core`) | **Device** | Deterministic; powers quick mode |
| AI lesson generation | **Server** (edge function) | Keeps the API key off the phone; enforces rate and cost limits; validates output |
| AI assessment of speech, pictures, free answers | **Server** (edge function) | Same reasons; the result is stored with the attempt |
| Source of truth for all data | **Server** (Postgres) | Backed up; the device copy is a cache plus an outbox |
| Progress and analytics | **Server views**, cached on the device | Calculated from the attempt log, so it can always be rebuilt |

### Offline-first sync (kept deliberately simple)

*On the web, local storage can be evicted by the browser. There, the local copy is only a cache plus a short-lived outbox: uploads happen after every exercise, the UI shows the sync status, and closing the tab with unsent recordings asks for confirmation ([ADR 0006](adr/0006-browser-as-first-class-platform.md)).*


A general-purpose sync engine (CRDTs, PowerSync, etc.) would be overkill here. This app's ownership rules make sync easy:

1. **Every record has one author.** The tutor writes lessons, assignments and feedback. The student writes sessions, attempts, media and review items. Two people never edit the same row, so **conflicts cannot happen**.
2. **Client-generated UUIDs + idempotent upsert.** A retried upload never creates a duplicate.
3. **Push:** local writes go into an `outbox` table first. A background worker drains it in order and deletes each entry only after the server confirms.
4. **Pull:** `select … where updated_at > last_pulled_at` for each table the user can see (RLS filters it).
5. **Media:** stored as a local file first. The upload records its SHA-256 hash. The attempt row only points at media the server has confirmed. A half-uploaded file is simply retried.

## 5. Key flows

### 5.1 Planning and generating lessons (see [CONTENT_FRAMEWORK.md](CONTENT_FRAMEWORK.md))

```
Goal + learner snapshot + curriculum graph ──► Plan (versioned sequence of objectives)
        ▲                                             │
        │  evidence: attempts, assessments,           │ next objectives
        │  FSRS, tutor ratings                        ▼
        │                              ai-orchestrator (MCP client + LlmClient, any provider)
        │                                ├─ reads MCP resources: framework, schema, snapshot, plan
        │                                ├─ model drafts a lesson targeted at the planned objectives
        │                                ├─ tool check_lesson → deterministic checks (coverage, load, keys…)
        │                                │     failures go back to the model once
        │                                ├─ second-opinion language review (a different model)
        │                                └─ tool save_lesson_draft → draft + generation_run provenance
        │                                             │
        │                              Tutor reviews/edits → publishes (immutable version)
        │                                             │
        └──────────── student studies (immersive / quick) ◄──┘

Weekly, or on a trigger (pace drift, plateau, goal change):
   weekly_plan_review prompt → propose_plan_revision → tutor approves → new plan version
```

The tutor can also connect their own MCP-capable AI client to the same server and do any of this conversationally. The same tools and the same limits apply. AI output is **never shown to the student without the tutor's approval**, and no AI tool can publish or delete anything.

### 5.2 The two learning modes (student)

The home screen offers two choices: **"Quick (3 min)"** and **"Deep session"**. Both use the same content and update the same FSRS items. Immersive lessons *introduce* words and structures; quick sessions *keep them fresh*.

| | Immersive / deep | Quick / shallow |
|---|---|---|
| Length | 20–45 min | 2–5 min (fixed time budget) |
| Content | One authored `Lesson`, played in order | Assembled on the device by `SessionComposer`: FSRS-due items + short drills from published lessons |
| Language of the UI | Spanish only; hints behind a tap (hint use is recorded) | The student's choice |
| Main input | Speaking, video, describing pictures, optional AI conversation role-play | Tap/swipe recall, listen-and-choose, short repeat-after-me |
| Feedback | AI assessment, then a tutor review | Instant, deterministic, on the device |
| Network / AI | Needs a download before starting ("lesson pack"); AI after submitting | Works fully offline; no AI; no tutor time |
| Main metric | Production quality (speaking score, tutor rating, fluency trend) | Retention (recall accuracy, items mastered, streak) |

### 5.3 Doing an immersive lesson

```
Exercise prompt (picture / audio / video / text)
   → student answers by speaking, recording video, or taking a photo
   → attempt row + media file written locally (instant; works offline)
   → outbox uploads the media, then the attempt
   → server trigger/function: transcribe → AI assessment → stores `assessment` on the attempt
   → the tutor sees it in the review queue, listens, and adds feedback
   → FSRS updates the review schedule for the vocabulary items involved
```

### 5.4 Doing a quick session

```
SessionComposer(dueItems, drillPool, timeBudget=3min) → an ordered list of auto-scorable exercises
   → each answer is scored instantly on the device → attempt row written locally → FSRS updated locally
   → the outbox syncs the session, attempts and review_items when online (no AI, no tutor review queue)
```

### 5.5 Tutor dashboard

This reads **server-side SQL views** built on `sessions`, `attempts` and `assessments`, **split by mode**:
- Immersive: speaking scores over time, tutor ratings, hint use, grammar topics with low scores.
- Quick: sessions per week, recall accuracy, items mastered or overdue, streak.

The tutor can use it on a phone or in a browser. A laptop screen is usually more comfortable for review.

## 6. Security

| Threat | Control |
|---|---|
| A stranger signs up | **Public sign-up disabled** in Supabase Auth. Accounts are created by invitation only |
| A user reads or writes another user's data | **Row Level Security on every table**, deny by default. A CI test runs queries as the student and as the tutor and checks each policy |
| API keys taken from the app | The app only has the Supabase *anon* key, which is safe to publish because RLS is on. AI keys and the service-role key live **only** in edge-function secrets or GitHub secrets |
| Media URLs leak | Private buckets; short-lived signed URLs |
| AI bill abuse, or a bug in a loop | Per-user rate limits in edge functions; a spend cap set in the AI provider's console |
| Stolen phone | Supabase session tokens kept in `expo-secure-store` (Keychain/Keystore), not in plain storage |
| XSS in the web app stealing the session (the token is in `localStorage` on the web) | Strict Content-Security-Policy, no third-party scripts or analytics, never render AI output as HTML (plain text only), short token lifetime, PKCE flow |
| Another website calling our functions | CORS on edge functions limited to our web origin; Auth redirect URLs limited to our domains |
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
| iOS distribution needs the Apple Developer Program ($99/yr) | Needed for TestFlight. Using the web app on iPhone costs nothing (see [COSTS.md](COSTS.md)) |
| Browser storage eviction (especially Safari) loses unsent recordings | Upload per exercise; `navigator.storage.persist()`; sync status in the UI; PWA install recommended on iPhone |
| Different recording formats across browsers | Store the real MIME type; test playback in Chrome, Safari and Firefox in CI (Playwright) |
| The two modes drift into two separate products | One content pool, one FSRS store, one attempt log; each mode is only a different session type |
| Supabase free-tier limits (1 GB storage, pausing when idle, no usable backups) | Our own backups; compressed media; moving media to R2 later behind `MediaStore`; Pro plan if it outgrows the free tier |
| Pronunciation scoring quality | Start with transcript comparison + LLM feedback; the tutor's human review is the real authority |
| AI produces incorrect Spanish | Tutor approval step; schema validation; the prompt asks for simple, checkable content |
| Over-engineering for 2 users | Only one app, one backend, no microservices, no custom servers to maintain |
