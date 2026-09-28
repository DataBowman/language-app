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

## 2. Hosted setup checklist (one-time, ~20 minutes)

The project is **`zppkafqzmamwnqozrchz`** and the backup bucket is **`language-app`** on Cloudflare R2. These identifiers are already set in the workflows (override them with repository *variables* `SUPABASE_PROJECT_REF`, `BACKUP_S3_ENDPOINT` and `BACKUP_S3_BUCKET` if they ever change). Everything else is done by GitHub Actions. You only create keys and click *Run workflow*.

**Never paste keys or passwords into chats, issues or commits.** They belong in GitHub secrets and your password manager.

### 2.1 Collect the keys

| # | Where | What to create | GitHub secret name |
|---|---|---|---|
| 1 | supabase.com → your avatar → *Account → Access Tokens* | A personal access token (name it "github-actions"). If it has an expiry date, put a reminder in your calendar to replace it: when it expires, deploys and nightly backups stop | `SUPABASE_ACCESS_TOKEN_30` (the workflows also accept `SUPABASE_ACCESS_TOKEN`) |
| 2 | The password chosen when the project was created, or reset it on the database settings page: `https://supabase.com/dashboard/project/zppkafqzmamwnqozrchz/database/settings` | The database password (keep it in your password manager) | `SUPABASE_DB_PASSWORD` |
| 3 | Supabase project → *Project Settings → API Keys* | The **service role** / secret key. It is powerful: it only ever goes into GitHub secrets, never into the app | `SUPABASE_SERVICE_ROLE_KEY` |
| 4 | Cloudflare → *R2 object storage* → *Account Details* → **Manage** next to *API Tokens* → **Create Account API token** (or *User API token*) | Permission **Object Read & Write**, scoped to the bucket `language-app`. The next page shows the Access Key ID and the Secret Access Key **once**: copy both | `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` |
| 5 | Your password manager | Generate a long random passphrase (30+ characters). **Keep it: without it the backups cannot be decrypted** | `BACKUP_PASSPHRASE` |

Add them in GitHub: *repository → Settings → Secrets and variables → Actions → New repository secret*.

### 2.2 Run the workflows (GitHub → Actions)

1. **Deploy database → Run workflow.** This applies all migrations and the auth settings from `supabase/config.toml`: public sign-up off, and the sign-in email showing the 6-digit code. It also runs automatically whenever a change under `supabase/` is merged to `main`, after CI has tested it. Never change the schema or auth settings in the dashboard, because the next deploy would overwrite them (ADR 0005).
2. **Add user → Run workflow**, once for the tutor (role *tutor*), then once for yourself (role *student*, with the tutor's email to link you). Accounts are created already confirmed. You simply open the app and sign in with the code emailed to you.
3. **Nightly backup → Run workflow**, then **Monthly restore test → Run workflow**. Both must be green before real data exists.

### 2.3 Point the app at the project

Create `apps/mobile/.env.local` (see `.env.example`) with:

```
EXPO_PUBLIC_SUPABASE_URL=https://zppkafqzmamwnqozrchz.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<publishable / anon key from Project Settings → API Keys>
```

The publishable key is safe to ship in the app, because every table is protected by Row Level Security. Without this file the app runs in development mode (role picker, no data).

### 2.4 Email sending (needed before real sign-in)

Sign-in works by a 6-digit code sent by email. Supabase's built-in email sender is for testing only:
- it only delivers to members of your Supabase organisation, so your tutor would get nothing;
- it sends very few emails per hour;
- on the free plan it does not allow custom email templates, and the default template contains a link instead of the code.

So the project needs a **custom SMTP provider**. Free options that are enough for two people:

| Provider | Free allowance | Notes |
|---|---|---|
| Brevo | ~300 emails/day | Can send from a verified single email address; no domain needed |
| Resend | ~3,000 emails/month | Needs a domain you own |
| Gmail | Personal volumes | Uses an *app password* (requires 2-step verification on the Google account) |

**We use Brevo.** The SMTP settings and the code template are in `supabase/config.toml`, and the Deploy database workflow applies them. You only create the credentials and add three GitHub secrets:

1. Create a free account at brevo.com.
2. **Verify a sender address**, i.e. the address the codes come from: *Senders, Domains & Dedicated IPs → Senders → Add a sender*, then confirm the email Brevo sends you.
3. **Create an SMTP key**: *SMTP & API → SMTP tab → Generate a new SMTP key*. The page also shows your **SMTP login**, which looks like an email address at `smtp-brevo.com`, and the server `smtp-relay.brevo.com`, port `587`. Copy the key straight away, because it's shown only once.
4. Add three GitHub secrets:

   | Secret | Value |
   |---|---|
   | `BREVO_SMTP_LOGIN` | the SMTP login from step 3 |
   | `BREVO_SMTP_KEY` | the SMTP key from step 3 |
   | `SMTP_SENDER_EMAIL` | the verified sender address from step 2 |

5. Run **Deploy database** (or merge any change under `supabase/`). It stops with a clear message if any of the three secrets is missing.

Menu names in Brevo may differ slightly; the items to look for are *Senders* and *SMTP & API*.

## 3. Adding or changing users later

Use the **Add user** workflow again. Running it for an existing email updates their role and name, and can link a student to a tutor. Removing someone is deliberate and manual: they have learning history, which the database refuses to delete by accident (ADR 0009).

## 4. Backups: what runs and how to restore

Without the secrets, both backup workflows skip with a notice. Once configured, they never fail silently.

What the backup does (`tools/backup/backup.sh`):
- links the project and dumps roles, schema and data with the Supabase CLI;
- refuses to upload an empty or incomplete dump;
- encrypts with GPG (AES-256) and uploads to `db/daily/YYYY-MM-DD/` in R2, with a SHA-256 checksum;
- on the 1st of the month, also copies to `db/monthly/`;
- copies new media without ever deleting anything from the backup;
- keeps daily copies for 30 days and monthly copies for about 13 months.

Media copying switches on when Supabase Storage S3 keys are added: secrets `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID` and `SUPABASE_S3_SECRET_ACCESS_KEY`, from *Storage → S3 Connection*. That's only needed once recordings exist; the backup workflow already passes them to the script.

What the restore test does (`tools/backup/restore-test.sh`):
- fetches the latest backup, and fails if it is more than 2 days old;
- verifies the checksum, decrypts, and restores into a blank throwaway Supabase database;
- checks that users and profiles exist and match, and that RLS is still enabled on every table.

### Restoring for real

Follow `restore-test.sh` step by step, but point the final `psql` commands at the new or recovered project's connection string instead of the throwaway database.

## 5. Web hosting (Cloudflare Pages)

The **Deploy web app** workflow builds the app against the hosted project and publishes it to Cloudflare Pages. It runs on every merge to `main` that changes the app, and on demand. On its first run it creates the Pages project `language-app`; the site address is shown at the end of the workflow log (usually `https://language-app.pages.dev`).

One-time setup:
1. **Cloudflare API token** (per Cloudflare's *Use Direct Upload with continuous integration* guide):
   - Open *My Profile → API Tokens* (personal token) or *Manage Account → API Tokens* (account-owned token).
   - Select **Create Token**, then under **Custom Token** select **Get started**.
   - Name it `github-pages-deploy`. Under **Permissions**, choose **Account → Cloudflare Pages → Edit**.
   - Select **Continue to summary → Create Token** and copy the token (it starts with `cfut_`).
   - In GitHub, add it as the **secret** `CLOUDFLARE_API_TOKEN`.
2. **Publishable key** (per Supabase's *API keys* guide):
   - In Supabase, open **Settings → API Keys** and copy the publishable key (`sb_publishable_…`), or the legacy `anon` key.
   - Supabase documents it as safe to expose.
   - In GitHub, open *Settings → Secrets and variables → Actions → Variables* tab → **New repository variable**, and add it as `SUPABASE_PUBLISHABLE_KEY`.

The workflow refuses to publish a build that does not contain the Supabase URL, so the development role picker can never go live.

### Manual alternative

Build with `pnpm build:web` (output: `apps/mobile/dist`) and deploy the folder to **Cloudflare Pages**. `apps/mobile/public/_headers` sets the security headers (strict CSP, no third-party scripts, microphone/camera limited to the site itself). Set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` as build environment variables. Configure the host to serve `index.html` for unknown paths (single-page app).

## 6. Read-only raw-data access for engineering (ADR 0013)

The app's student account shows curated progress only. For engineering and analysis, create a separate read-only login in the SQL editor (once), with a long random password kept in your password manager:

```sql
create role engineer_ro login password '<long-random-password>' in role analytics_reader;
alter role engineer_ro set default_transaction_read_only = on;
```

Connect with the **session pooler** connection string, using `engineer_ro.<project-ref>` as the user name. For example, with `psql`, a notebook, a dashboard tool, or an AI assistant through a read-only Postgres MCP server. This login sees every table in `public` (all users' events, profiles, audit log). It cannot write, and it cannot see `auth.users`. If it is ever exposed: `drop role engineer_ro;` and create a new one.
