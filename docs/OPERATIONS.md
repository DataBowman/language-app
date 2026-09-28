# Operations

How to run the app locally, set up the hosted services, invite users, and make backups work. Everything here is free-tier.

## 1. Local development

```bash
corepack enable            # provides the pinned pnpm version
pnpm install
pnpm test                  # unit tests (packages/core)
pnpm typecheck
pnpm --filter mobile web   # run the app in a browser (or: ios / android with Expo Go / a dev build)
```

**With no backend configured, the app runs in development mode.** The sign-in screen shows a role picker ("Continue as student / tutor") and no data is stored anywhere. This is safe: there is no data to protect. Once `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` are set, only real, invite-only sign-in works.

### Database tests

They need any Postgres ≥ 16 you can create databases on:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm db:test
```

This applies every migration to a throwaway database and runs `supabase/tests/*_test.sql` as different users (student, tutor, other tutor, anonymous) to prove the Row Level Security rules.

### Browser end-to-end tests

```bash
pnpm build:web
pnpm --filter mobile exec playwright install chromium   # once
pnpm --filter mobile test:e2e
```

## 2. Hosted Supabase project (one-time)

1. Create a project at supabase.com (free tier). Choose a strong database password and keep it in a password manager.
2. **Turn off public sign-up**: *Authentication → Sign In / Providers → Allow new users to sign up: off.* (This mirrors `supabase/config.toml`.)
3. Apply the migrations from your machine:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Never change the schema in the dashboard: every change is a migration in git (ADR 0005).
4. Put the project URL and **publishable (anon) key** in `apps/mobile/.env.local` (see `.env.example`). This key is safe to ship. **Never** put the service-role key or any AI key in the app.
5. *Authentication → URL Configuration*: add the web app's URL and `languageapp://` to the redirect allow-list.

## 3. Inviting the student and the tutor

Accounts exist only by invitation. The role is set by the invitation and cannot be changed by users.

- Dashboard: *Authentication → Users → Invite user*. Then set the role in the SQL editor:
  ```sql
  update public.profiles set role = 'student', display_name = 'Name' where id = (select id from auth.users where email = 'student@example.com');
  update public.profiles set role = 'tutor',   display_name = 'Name' where id = (select id from auth.users where email = 'tutor@example.com');
  insert into public.tutor_students (tutor_id, student_id)
  select t.id, s.id from auth.users t, auth.users s where t.email = 'tutor@example.com' and s.email = 'student@example.com';
  ```
- Or, from an admin script with the service-role key: `auth.admin.inviteUserByEmail(email, { data: { role: 'student', display_name: 'Name' } })`. The role is then applied automatically.

Sign-in is by a 6-digit code sent by email. For the code to appear in the email, the *Magic Link* email template must include `{{ .Token }}` (Authentication → Emails).

## 4. Backups (do this before any real data exists)

1. Create a bucket at **Cloudflare R2** (or Backblaze B2). Use a different vendor from Supabase. Create an access key limited to that bucket.
2. In the Supabase dashboard, get the **session pooler** connection string (*Connect → Session pooler*). If the password contains special characters, percent-encode them.
3. Optional (for media, once recordings exist): *Storage → S3 Connection*: create S3 access keys.
4. Add GitHub repository secrets (*Settings → Secrets and variables → Actions*):

   | Secret | Value |
   |---|---|
   | `SUPABASE_DB_URL` | session pooler connection string |
   | `BACKUP_S3_ENDPOINT` | e.g. `https://<account-id>.r2.cloudflarestorage.com` |
   | `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | R2/B2 access key |
   | `BACKUP_S3_BUCKET` | bucket name |
   | `BACKUP_PASSPHRASE` | long random passphrase. **Store it in your password manager too, or the backups cannot be decrypted** |
   | `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | optional, for media |

5. Run *Actions → Nightly backup → Run workflow* once, then *Monthly restore test → Run workflow*. Both must be green.

Without the secrets, both workflows skip with a notice. They never fail silently once configured.

What the backup does (`tools/backup/backup.sh`): dumps roles, schema and data with the Supabase CLI. It refuses to upload an empty or incomplete dump, encrypts with GPG (AES-256), and uploads to `db/daily/YYYY-MM-DD/` with a SHA-256 checksum. On the 1st of the month it also copies to `db/monthly/`. It copies new media without ever deleting from the backup. Daily copies are kept for 30 days, monthly for ~13 months.

What the restore test does (`tools/backup/restore-test.sh`): fetches the latest backup and fails if it is more than 2 days old. It verifies the checksum, decrypts, and restores into a blank throwaway Supabase database. It then checks that users and profiles exist and match, and that RLS is still enabled on every table.

### Restoring for real

Follow `restore-test.sh` step by step, but point the final `psql` commands at the new/recovered project's connection string instead of the throwaway database.

## 5. Web hosting (when ready)

Build with `pnpm build:web` (output: `apps/mobile/dist`) and deploy the folder to **Cloudflare Pages**. `apps/mobile/public/_headers` sets the security headers (strict CSP, no third-party scripts, microphone/camera limited to the site itself). Set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` as build environment variables. Configure the host to serve `index.html` for unknown paths (single-page app).

## 6. Read-only raw-data access for engineering (ADR 0013)

The app's student account shows curated progress only. For engineering and analysis, create a separate read-only login in the SQL editor (once), with a long random password kept in your password manager:

```sql
create role engineer_ro login password '<long-random-password>' in role analytics_reader;
alter role engineer_ro set default_transaction_read_only = on;
```

Connect with the **session pooler** connection string, using `engineer_ro.<project-ref>` as the user name. For example, with `psql`, a notebook, a dashboard tool, or an AI assistant through a read-only Postgres MCP server. This login sees every table in `public` (all users' events, profiles, audit log). It cannot write, and it cannot see `auth.users`. If it is ever exposed: `drop role engineer_ro;` and create a new one.
