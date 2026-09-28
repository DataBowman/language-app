# language-app

A private Spanish-learning app for **iOS, Android and the web browser** with two users: a **student** and a **tutor**.

- **Student**: learns in two modes:
  - **Immersive (deep)**: 20–45 minute Spanish-only lessons built on audio, video and pictures, with speaking answers reviewed by AI and the tutor.
  - **Quick (shallow)**: 2–5 minute spaced-repetition drills, scored instantly, working offline.
- **Tutor**: creates lessons (with AI help), reviews the student's recordings, logs live sessions in seconds from a suggested plan, and sees full analytics (also through their own AI).
- **Challenges**: real-world goals (greet a colleague, travel) with readiness measured from evidence.

This is meant to be a long-running project. It uses open-source parts and costs as little as possible. **Security** and **not losing data** matter most.

## Status

Foundation (Phase 0) is in place and Phase 1 has started: monorepo, domain package with tests, app shell for iOS/Android/web, database migrations with access-rule tests (identity, learning event ledger, learner context and content tables), CI and backup workflows. Learner context (variety, level, goals, time) is runtime data ([ADR 0014](docs/adr/0014-learner-context-is-data.md)).

## Quick start

```bash
corepack enable && pnpm install
pnpm test && pnpm typecheck
pnpm --filter mobile web      # opens the app in a browser; no backend needed (development role picker)
```

Setting up Supabase, inviting users, backups and hosting: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Repository layout

| Path | What |
|---|---|
| `apps/mobile` | Expo app (iOS, Android, web) for both student and tutor |
| `packages/core` | Pure TypeScript domain logic: lesson schema, exercise types, curriculum graph, feasibility, quality checks, learning events + evidence, challenges, tutored-session suggestions, curated progress |
| `supabase/` | Config, SQL migrations, RLS tests |
| `tools/backup` | Backup and restore-test scripts used by the scheduled workflows |
| `docs/` | Design documents and decision records |

## Documents

| Doc | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The overall design: components, what runs on the device and what runs on the server, data flow, security, backups |
| [docs/CONTENT_FRAMEWORK.md](docs/CONTENT_FRAMEWORK.md) | **What good AI-generated content needs**: goals, learner model, curriculum graph, adaptive planning, quality checks, translation. Decide this before the schema |
| [docs/LEARNING_DATA.md](docs/LEARNING_DATA.md) | What learning data is recorded (events), and which future features it will power |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tables, lesson content format, access rules |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build phases, from the foundation to the full feature set |
| [docs/COSTS.md](docs/COSTS.md) | What each piece costs and how to keep it near zero |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Running locally, Supabase setup, invitations, backups, hosting |
| [docs/adr/](docs/adr/) | Architecture Decision Records: why each major choice was made |

## Planned stack (summary)

| Concern | Choice |
|---|---|
| App (iOS + Android + web, both roles) | Expo / React Native + Expo web, TypeScript; platform adapters for native vs browser |
| Learning modes | One content pool; immersive = authored lessons, quick = sessions assembled on the device from due items |
| Web hosting | Cloudflare Pages / GitHub Pages (static, HTTPS, PWA) |
| Backend (database, login, file storage, server functions) | Supabase (open source, can be self-hosted later) |
| Local storage | SQLite (`expo-sqlite`; WASM on the web), offline-first with an upload queue. On the web it is only a cache, because the browser may clear it |
| AI lesson generation / feedback | Any provider: an MCP server exposes the curriculum data + safe tools; a thin model adapter; switching providers is decided by an eval set |
| Curriculum | A graph of objectives (CEFR + Instituto Cervantes PCIC) + a versioned plan that is re-calculated from the goal, deadline and measured pace |
| Speech-to-text | Whisper: on the device for native, on the server for the web (and as a fallback) |
| Text-to-speech | Built-in OS/browser Spanish voices (free); server audio as a fallback |
| Spaced repetition | FSRS (`ts-fsrs`, open source) |
| Backups | Nightly GitHub Action → Postgres dump + media copy → Cloudflare R2 / Backblaze B2 |
