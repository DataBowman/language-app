-- Tests for 20260929000000_curated_access_tutored_sessions_challenges.sql (ADRs 0010–0012).
-- Runs after 20_: tutor T (…0a), student S (…0b, linked to T), other student O (…0c), other tutor T2 (…0d).
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

-- ─── Student S: writes own facts, cannot read the raw ledger ──────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
do $$ begin
  execute pg_temp.ev('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'challenge_started', '{"challengeId":"3f1c2b1e-8a4d-4c7e-9f00-1234567890ab"}');
  execute pg_temp.ev('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'challenge_completed', '{"where":"real_world","confidence":4}');
  execute pg_temp.ev('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'screen_viewed', '{"route":"/student"}');
end $$;
select pg_temp.assert((select count(*) from public.learning_events) = 0, 'student cannot read raw events, not even their own');
select pg_temp.assert_fails(pg_temp.ev('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'tutored_session_logged', '{"minutes":60}'),
  '42501', 'student cannot log a tutored session');
commit;

-- ─── Tutor T ──────────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
do $$ begin
  execute pg_temp.ev('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-00000000000b', 'tutored_session_logged',
    '{"minutes":60,"format":"in_person","items":[{"objectiveId":"gr.ser_estar","coverage":"covered","suggested":true}],"secondsToLog":20}');
  execute pg_temp.ev('30000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-00000000000a', 'screen_viewed', '{"route":"/tutor"}');
end $$;
select pg_temp.assert(exists (select 1 from public.learning_events where type = 'challenge_completed'), 'tutor sees the student''s challenge events');
select pg_temp.assert(exists (select 1 from public.learning_events where id = '30000000-0000-0000-0000-000000000011'), 'tutor sees their own events');
select pg_temp.assert_fails(pg_temp.ev('30000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-00000000000c', 'tutored_session_logged', '{"minutes":30}'),
  '42501', 'tutor cannot log a session for an unlinked student');
commit;

-- ─── Other tutor T2 sees nothing of S, and S cannot see T's own events ────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d"}';
select pg_temp.assert(not exists (select 1 from public.learning_events where learner_id = '00000000-0000-0000-0000-00000000000b'), 'unlinked tutor sees none of the student''s events');
commit;

\o
\echo 'All curated-access tests passed.'
