#!/usr/bin/env bash
# Applies all migrations to a fresh throwaway database and runs the RLS tests.
# Needs a Postgres server; DATABASE_URL must point at a database the user may CREATE DATABASE from
# (default: local postgres as the "postgres" user). The test database is dropped afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_URL="${DATABASE_URL:-postgresql://postgres@localhost:5432/postgres}"
DB="rls_test_$$"
TEST_URL="$(python3 -c 'import sys,urllib.parse as u;p=u.urlparse(sys.argv[1]);print(p._replace(path="/"+sys.argv[2]).geturl())' "$ADMIN_URL" "$DB")"

psql "$ADMIN_URL" -qc "create database $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qc "drop database if exists $DB with (force)" >/dev/null' EXIT

psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f tests/00_supabase_stub.sql
for m in migrations/*.sql; do
  echo "applying $m"
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$m"
done
for t in tests/[1-9]*_test.sql; do
  echo "running $t"
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$t"
done
