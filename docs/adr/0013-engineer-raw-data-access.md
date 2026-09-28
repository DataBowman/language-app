# 0013: Read-only raw-data access for the engineer

Date: 2026-09-30 · Status: Accepted · Amends: 0010

## Context
The student is also the engineer who will adapt features, so they need the raw learning data: every event, every user, the audit log. ADR 0010 made the student *app* view curated, and that choice still stands for the app.

## Decision
- Keep two personas apart. **In the app**, the student account stays curated and cannot read the raw ledger. **For engineering**, a separate **read-only login** is a member of the `analytics_reader` role (migration 0004).
- `analytics_reader` can SELECT every table in `public`, through an explicit "read all" RLS policy per table. It cannot write anything, and it cannot read `auth.users` (emails, login data).
- The login is created by hand with its own password and is set to read-only transactions (OPERATIONS §6). It is used for SQL, notebooks, dashboards, and **AI tools** (e.g. a Postgres MCP server in read-only mode) when exploring the data or designing features.
- Guard for the future: a test fails if any table with RLS lacks an `analytics_reader` read policy. New tables must add one in the migration that creates them.
- Why not simply let the student account read its own events? That would give the engineer only their own rows (not the tutor's records or the audit log), and it would blur the curated app experience we want to test honestly. If an in-app "export my data" is wanted later, it can be added as its own feature.

## Consequences
- Full raw access without using the admin (`postgres`) password for day-to-day analysis. That password stays for migrations and restores only.
- One more credential to keep in the password manager. Revoke it with `drop role …` if it is ever exposed.
