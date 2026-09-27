# language-app

A private Spanish-learning app for **iOS, Android and the web browser** with two users: a **student** and a **tutor**.

- **Student**: learns in two modes:
  - **Immersive (deep)**: 20–45 minute Spanish-only lessons built on audio, video and pictures, with speaking answers reviewed by AI and the tutor.
  - **Quick (shallow)**: 2–5 minute spaced-repetition drills, scored instantly, working offline.
- **Tutor**: creates lessons (with AI help), reviews the student's recordings, and sees progress over time.

This is meant to be a long-running project. It uses open-source parts and costs as little as possible. **Security** and **not losing data** matter most.

## Status

Foundation / design phase. No application code yet. Start here:

| Doc | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The overall design: components, what runs on the device and what runs on the server, data flow, security, backups |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tables, lesson content format, access rules |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build phases, from the foundation to the full feature set |
| [docs/COSTS.md](docs/COSTS.md) | What each piece costs and how to keep it near zero |
| [docs/adr/](docs/adr/) | Architecture Decision Records: why each major choice was made |

## Planned stack (summary)

| Concern | Choice |
|---|---|
| App (iOS + Android + web, both roles) | Expo / React Native + Expo web, TypeScript; platform adapters for native vs browser |
| Learning modes | One content pool; immersive = authored lessons, quick = sessions assembled on the device from due items |
| Web hosting | Cloudflare Pages / GitHub Pages (static, HTTPS, PWA) |
| Backend (database, login, file storage, server functions) | Supabase (open source, can be self-hosted later) |
| Local storage | SQLite (`expo-sqlite`; WASM on the web), offline-first with an upload queue. On the web it is only a cache, because the browser may clear it |
| AI lesson generation / feedback | LLM called only from server functions, behind a provider interface |
| Speech-to-text | Whisper: on the device for native, on the server for the web (and as a fallback) |
| Text-to-speech | Built-in OS/browser Spanish voices (free); server audio as a fallback |
| Spaced repetition | FSRS (`ts-fsrs`, open source) |
| Backups | Nightly GitHub Action → Postgres dump + media copy → Cloudflare R2 / Backblaze B2 |
