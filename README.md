# language-app

A private Spanish-learning app for iOS and Android with two users: a **student** and a **tutor**.

- **Student**: works through lessons that use audio, video and pictures, mostly speaking and looking rather than typing.
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
| Mobile app (iOS + Android + web for the tutor) | Expo / React Native, TypeScript |
| Backend (database, login, file storage, server functions) | Supabase (open source, can be self-hosted later) |
| Local storage on the device | SQLite (`expo-sqlite`), offline-first with an upload queue |
| AI lesson generation / feedback | LLM called only from server functions, behind a provider interface |
| Speech-to-text | Whisper (on the device or on the server) |
| Text-to-speech | The phone's built-in Spanish voices (free) |
| Spaced repetition | FSRS (`ts-fsrs`, open source) |
| Backups | Nightly GitHub Action → Postgres dump + media copy → Cloudflare R2 / Backblaze B2 |
