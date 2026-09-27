#!/usr/bin/env bash
# Nightly off-site backup (ADR 0005): Supabase database dump + copy of new media → S3-compatible bucket (R2/B2).
#
# Required env:
#   SUPABASE_DB_URL                  Postgres connection string of the hosted project (session pooler)
#   BACKUP_S3_ENDPOINT, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY, BACKUP_S3_BUCKET
# Optional env:
#   BACKUP_PASSPHRASE                Encrypt dumps with GPG (AES-256). Strongly recommended.
#   SUPABASE_S3_ENDPOINT, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY, SUPABASE_S3_REGION
#                                    Supabase Storage S3 credentials; enables the media copy.
#   DAILY_RETENTION_DAYS (30), MONTHLY_RETENTION_DAYS (400)
#
# Needs: supabase CLI (uses Docker for pg_dump), rclone, gzip, gpg.
set -euo pipefail

: "${SUPABASE_DB_URL:?}" "${BACKUP_S3_ENDPOINT:?}" "${BACKUP_S3_ACCESS_KEY_ID:?}" "${BACKUP_S3_SECRET_ACCESS_KEY:?}" "${BACKUP_S3_BUCKET:?}"
DAILY_RETENTION_DAYS="${DAILY_RETENTION_DAYS:-30}"
MONTHLY_RETENTION_DAYS="${MONTHLY_RETENTION_DAYS:-400}"

# rclone remotes from env: "dest" = backup bucket, "supa" = Supabase Storage (optional).
export RCLONE_CONFIG_DEST_TYPE=s3 RCLONE_CONFIG_DEST_PROVIDER=Other
export RCLONE_CONFIG_DEST_ENDPOINT="$BACKUP_S3_ENDPOINT"
export RCLONE_CONFIG_DEST_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_DEST_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_DEST_NO_CHECK_BUCKET=true

STAMP="$(date -u +%Y-%m-%d)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "▶ Dumping database"
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$WORK/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$WORK/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$WORK/data.sql"

# Refuse to upload an obviously broken dump (e.g. empty after a connection problem).
for f in roles schema data; do
  [ -s "$WORK/$f.sql" ] || { echo "✖ $f.sql is empty — aborting" >&2; exit 1; }
done
grep -q 'CREATE TABLE "public"."profiles"\|CREATE TABLE IF NOT EXISTS "public"."profiles"' "$WORK/schema.sql" \
  || { echo "✖ schema.sql does not contain public.profiles — aborting" >&2; exit 1; }

tar -C "$WORK" -czf "$WORK/db.tar.gz" roles.sql schema.sql data.sql
ARCHIVE="$WORK/db.tar.gz"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
    -o "$WORK/db.tar.gz.gpg" "$ARCHIVE" 3<<<"$BACKUP_PASSPHRASE"
  ARCHIVE="$WORK/db.tar.gz.gpg"
else
  echo "⚠ BACKUP_PASSPHRASE not set — uploading an unencrypted dump" >&2
fi
NAME="$(basename "$ARCHIVE")"
sha256sum "$ARCHIVE" | awk '{print $1}' > "$WORK/$NAME.sha256"

echo "▶ Uploading db/daily/$STAMP"
rclone copyto "$ARCHIVE" "dest:$BACKUP_S3_BUCKET/db/daily/$STAMP/$NAME"
rclone copyto "$WORK/$NAME.sha256" "dest:$BACKUP_S3_BUCKET/db/daily/$STAMP/$NAME.sha256"
if [ "$(date -u +%d)" = "01" ]; then
  echo "▶ Monthly copy"
  rclone copy "dest:$BACKUP_S3_BUCKET/db/daily/$STAMP" "dest:$BACKUP_S3_BUCKET/db/monthly/$STAMP"
fi

if [ -n "${SUPABASE_S3_ENDPOINT:-}" ]; then
  echo "▶ Copying media (copy, never sync: nothing is deleted from the backup)"
  export RCLONE_CONFIG_SUPA_TYPE=s3 RCLONE_CONFIG_SUPA_PROVIDER=Other
  export RCLONE_CONFIG_SUPA_ENDPOINT="$SUPABASE_S3_ENDPOINT"
  export RCLONE_CONFIG_SUPA_REGION="${SUPABASE_S3_REGION:-us-east-1}"
  export RCLONE_CONFIG_SUPA_ACCESS_KEY_ID="${SUPABASE_S3_ACCESS_KEY_ID:?}"
  export RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY="${SUPABASE_S3_SECRET_ACCESS_KEY:?}"
  for bucket in $(rclone lsf --dirs-only supa: | tr -d '/'); do
    rclone copy "supa:$bucket" "dest:$BACKUP_S3_BUCKET/media/$bucket" --checksum
  done
else
  echo "ℹ SUPABASE_S3_* not set — skipping media copy"
fi

echo "▶ Applying retention"
rclone delete --min-age "${DAILY_RETENTION_DAYS}d" "dest:$BACKUP_S3_BUCKET/db/daily"
rclone delete --min-age "${MONTHLY_RETENTION_DAYS}d" "dest:$BACKUP_S3_BUCKET/db/monthly"
rclone rmdirs --leave-root "dest:$BACKUP_S3_BUCKET/db" || true

echo "✔ Backup $STAMP complete"
