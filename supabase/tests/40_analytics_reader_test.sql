-- Tests for 20260930000000_analytics_reader.sql (ADR 0013). Runs after 10_–30_, which seeded users and events.
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

create function pg_temp.assert_fails(sql text, state text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlstate <> state then raise exception 'ASSERTION FAILED (got % %): %', sqlstate, sqlerrm, msg; end if;
    return;
  end;
  raise exception 'ASSERTION FAILED (statement succeeded): %', msg;
end $$;

-- Builds an INSERT for an event; learner/actor/type/payload vary per test.
create function pg_temp.ev(id text, learner text, type text, payload text, actor text default null,
                           occurred text default 'now()', received text default null) returns text
language sql as $$
  select format(
    'insert into public.learning_events (id, type, learner_id, %s session_id, occurred_at, %s seq, device_id, platform, app_version, tz_offset_min, payload) '
    'values (%L, %L, %L, %s null, %s, %s 1, ''dev-1'', ''web'', ''0.1.0'', 60, %L::jsonb)',
    case when actor is null then '' else 'actor_id,' end,
    case when received is null then '' else 'received_at,' end,
    id, type, learner,
    case when actor is null then '' else quote_literal(actor) || ',' end,
    occurred,
    case when received is null then '' else quote_literal(received) || ',' end,
    payload);
$$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- A login like the one an engineer would create (docs/OPERATIONS.md §6).
do $$ begin
  if not exists (select from pg_roles where rolname = 'engineer_ro_test') then create role engineer_ro_test nologin; end if;
end $$;
grant analytics_reader to engineer_ro_test;
grant execute on all functions in schema pg_temp to engineer_ro_test;

begin;
set local role engineer_ro_test;
select pg_temp.assert((select count(*) from public.profiles) = 5, 'engineer sees every profile (but not auth.users: emails and login data stay private)');
select pg_temp.assert_fails($$select * from auth.users$$, '42501', 'engineer login cannot read authentication data');
select pg_temp.assert((select count(distinct learner_id) from public.learning_events) >= 2, 'engineer sees raw events of every user, tutor included');
select pg_temp.assert(exists (select 1 from public.learning_events where type = 'tutored_session_logged'), 'engineer sees tutor-recorded events');
select pg_temp.assert((select count(*) from public.audit_log) > 0, 'engineer sees the audit log');
select pg_temp.assert((select count(*) from public.tutor_students) = 1, 'engineer sees tutor links');
select pg_temp.assert_fails(pg_temp.ev('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'screen_viewed', '{}'),
  '42501', 'engineer login cannot write events');
select pg_temp.assert_fails($$update public.profiles set display_name = 'x'$$, '42501', 'engineer login cannot edit profiles');
select pg_temp.assert_fails($$delete from public.tutor_students$$, '42501', 'engineer login cannot delete links');
commit;

-- Guard for future migrations: every RLS table must be readable by analytics_reader.
select pg_temp.assert(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('r', '*')
                    and 'analytics_reader'::regrole::oid = any (p.polroles))
), 'every table with RLS has an analytics_reader read policy (add one in the migration that creates the table)');

-- The student's app account still gets no raw rows (ADR 0010 is unchanged for the app).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select pg_temp.assert((select count(*) from public.learning_events) = 0, 'the student app account still cannot read raw events');
commit;

\o
\echo 'All analytics_reader tests passed.'
