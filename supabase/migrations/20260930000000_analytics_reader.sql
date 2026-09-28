-- 0004 read-only engineering access to raw data (ADR 0013).
-- The student screens stay curated (ADR 0010). The owner/engineer reads everything through a separate
-- read-only login that is a member of analytics_reader: every table, every user, no writes.
-- Create the login itself by hand (docs/OPERATIONS.md §6); its password never goes into git.

do $$
begin
  if not exists (select from pg_roles where rolname = 'analytics_reader') then
    create role analytics_reader nologin;
  end if;
end $$;
comment on role analytics_reader is 'Read-only access to all app data for engineering and analysis (ADR 0013). Grant to a login role; never write.';

grant usage on schema public to analytics_reader;
grant select on all tables in schema public to analytics_reader;
-- Tables created by later migrations are readable too (their RLS policy is still required — see below).
alter default privileges in schema public grant select on tables to analytics_reader;

-- RLS applies to this role like any other, so each table needs an explicit read-everything policy.
-- supabase/tests/40_analytics_reader_test.sql fails if a table with RLS is missing one.
create policy "analytics_reader: read all" on public.profiles       for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.tutor_students for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.audit_log      for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.learning_events for select to analytics_reader using (true);
