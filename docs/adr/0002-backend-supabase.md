# 0002: Supabase as the backend

Date: 2026-09-27 · Status: Accepted

## Context
The app needs login, a relational database, file storage and a secure place to call AI APIs from. It should cost as little as possible, be open source, and need minimal ops work, with a strong security model.

## Options
- **Supabase**: open-source Postgres, Auth, Storage and Edge Functions. Row Level Security gives access control *in the database*. It has a free tier and can be self-hosted later with Docker. Postgres and SQL migrations are portable anywhere.
- **PocketBase on a ~$5 VPS**: a single Go binary using SQLite, very simple. But you are then responsible for OS patching, TLS and uptime, and it needs Litestream for backups.
- **Firebase**: generous free tier, but proprietary, a NoSQL data model, and lock-in.
- **Custom server (Node + Postgres)**: maximum control, but the most code and ops to own.

## Decision
Use Supabase (hosted free tier to start). All schema and access rules live in `supabase/migrations` in git. Nothing is configured by hand in the dashboard.

## Consequences
- The free tier pauses idle projects and gives no usable backups, so we run our own backups (ADR 0005).
- The exit path is to self-host Supabase or use plain Postgres, because the data is standard Postgres and the files sit behind `MediaStore`.
