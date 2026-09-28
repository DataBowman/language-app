#!/usr/bin/env bash
# Monthly restore test (ADR 0005): restores the latest daily backup into a throwaway local Supabase
# Postgres and runs sanity checks. An untested backup is not a backup.
#
# Env: BACKUP_S3_ENDPOINT, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY, BACKUP_S3_BUCKET,
#      BACKUP_PASSPHRASE (if backups are encrypted), MAX_BACKUP_AGE_DAYS (default 2)
# Needs: supabase CLI + Docker, rclone, psql, gpg.
set -euo pipefail

: "${BACKUP_S3_ENDPOINT:?}" "${BACKUP_S3_ACCESS_KEY_ID:?}" "${BACKUP_S3_SECRET_ACCESS_KEY:?}" "${BACKUP_S3_BUCKET:?}"
MAX_BACKUP_AGE_DAYS="${MAX_BACKUP_AGE_DAYS:-2}"
export RCLONE_CONFIG_DEST_TYPE=s3 RCLONE_CONFIG_DEST_PROVIDER=Other
export RCLONE_CONFIG_DEST_REGION="${BACKUP_S3_REGION:-auto}"
export RCLONE_CONFIG_DEST_ENDPOINT="$BACKUP_S3_ENDPOINT"
export RCLONE_CONFIG_DEST_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_DEST_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"

WORK="$(mktemp -d)"
# A blank Supabase project: the repo's own migrations must NOT be applied before the restore.
PROJ="$WORK/proj"
trap 'supabase stop --no-backup --workdir "$PROJ" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

LATEST="$(rclone lsf --dirs-only "dest:$BACKUP_S3_BUCKET/db/daily" | sort | tail -1 | tr -d '/')"
[ -n "$LATEST" ] || { echo "✖ no backups found" >&2; exit 1; }
AGE_DAYS=$(( ( $(date -u +%s) - $(date -u -d "$LATEST" +%s) ) / 86400 ))
echo "▶ Latest backup: $LATEST ($AGE_DAYS days old)"
[ "$AGE_DAYS" -le "$MAX_BACKUP_AGE_DAYS" ] || { echo "✖ latest backup is older than $MAX_BACKUP_AGE_DAYS days — is the nightly job failing?" >&2; exit 1; }

rclone copy "dest:$BACKUP_S3_BUCKET/db/daily/$LATEST" "$WORK"
ARCHIVE="$(ls "$WORK"/db.tar.gz* | grep -v sha256 | head -1)"
[ "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$(cat "$ARCHIVE.sha256")" ] || { echo "✖ checksum mismatch" >&2; exit 1; }
if [[ "$ARCHIVE" == *.gpg ]]; then
  gpg --batch --pinentry-mode loopback --passphrase-fd 3 -d -o "$WORK/db.tar.gz" "$ARCHIVE" 3<<<"${BACKUP_PASSPHRASE:?encrypted backup needs BACKUP_PASSPHRASE}"
fi
tar -C "$WORK" -xzf "$WORK/db.tar.gz"

echo "▶ Starting a throwaway Supabase database"
mkdir -p "$PROJ"
(cd "$PROJ" && supabase init >/dev/null)
supabase db start --workdir "$PROJ"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
# The throwaway database's superuser. Supabase-managed internal tables (e.g. storage.buckets_vectors)
# refuse writes from "postgres", so the test restore runs as the superuser; our own data is what we verify.
ADMIN_URL="postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres"

echo "▶ Restoring"
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=0 -f "$WORK/roles.sql" >/dev/null   # existing roles may already exist
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 --single-transaction \
  -c 'SET session_replication_role = replica' -f "$WORK/schema.sql" -f "$WORK/data.sql" >/dev/null

echo "▶ Sanity checks"
psql "$DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
do $$
begin
  -- Our schema came back (an empty database with no users yet is still a valid backup).
  if to_regclass('public.profiles') is null or to_regclass('public.learning_events') is null
     or to_regclass('public.lessons') is null then
    raise exception 'core tables missing after restore';
  end if;
  if (select count(*) from auth.users) <> (select count(*) from public.profiles) then
    raise exception 'auth.users and profiles counts differ';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) then
    raise exception 'a restored public table has RLS disabled';
  end if;
end $$;
select 'users: ' || count(*) from auth.users;
select 'profiles: ' || count(*) from public.profiles;
select 'learning_events: ' || count(*) from public.learning_events;
select 'audit_log: ' || count(*) || ', latest ' || coalesce(max(at)::text, 'none') from public.audit_log;
SQL
echo "✔ Restore test of $LATEST passed"
