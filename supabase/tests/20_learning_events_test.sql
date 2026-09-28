-- Tests for 20260928000000_learning_events.sql. Uses the users seeded by 10_rls_test.sql:
-- tutor T (…0a), student S (…0b, linked to T), other student O (…0c), other tutor T2 (…0d).
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

-- ─── Student S ────────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';

do $$ begin execute pg_temp.ev('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
  'exercise_answered', '{"result":"wrong","score":0}', received => '2000-01-01T00:00:00Z'); end $$;
select pg_temp.assert((select actor_id from public.learning_events where id = '10000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000b',
  'actor defaults to the signed-in user');
select pg_temp.assert((select received_at from public.learning_events where id = '10000000-0000-0000-0000-000000000001') > now() - interval '1 minute',
  'a client-supplied received_at is replaced by the server time');

-- Retrying the same upload is harmless.
insert into public.learning_events (id, type, learner_id, occurred_at, seq, device_id, platform, app_version, tz_offset_min, payload)
values ('10000000-0000-0000-0000-000000000001', 'exercise_answered', '00000000-0000-0000-0000-00000000000b', now(), 1, 'dev-1', 'web', '0.1.0', 60, '{}')
on conflict (id) do nothing;
select pg_temp.assert((select count(*) from public.learning_events) = 1, 'duplicate upload is ignored');

select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'screen_viewed', '{}'),
  '42501', 'student cannot record events about another student');
select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'screen_viewed', '{}',
  actor => '00000000-0000-0000-0000-00000000000a'), '42501', 'student cannot pretend to be the tutor');
select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'tutor_observation', '{"level":"secure"}'),
  '42501', 'student cannot record tutor observations about themself');
select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b', 'assessment_recorded', '{"source":"ai","score":1}'),
  '42501', 'student cannot record their own assessments');
select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000b', 'made_up_type', '{}'),
  '23514', 'unknown event types are rejected');
select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000000b', 'screen_viewed',
  json_build_object('route', repeat('x', 20000))::text), '23514', 'oversized payloads are rejected');
select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000b', 'screen_viewed', '[1,2]'),
  '23514', 'payload must be a JSON object');
select pg_temp.assert_fails(pg_temp.ev('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000b', 'screen_viewed', '{}',
  occurred => $q$now() + interval '3 days'$q$), '23514', 'events from a device clock far in the future are rejected');
select pg_temp.assert_fails($$update public.learning_events set payload = '{}'$$, '42501', 'student cannot edit events');
select pg_temp.assert_fails($$delete from public.learning_events$$, '42501', 'student cannot delete events');
commit;

-- ─── Tutor T ──────────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';

select pg_temp.assert((select count(*) from public.learning_events) = 1, 'tutor sees their student''s events');
do $$ begin execute pg_temp.ev('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
  'tutor_observation', '{"level":"progressing","objectiveIds":["gr.ser_estar"]}'); end $$;
do $$ begin execute pg_temp.ev('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b',
  'assessment_recorded', '{"source":"tutor","score":0.9}'); end $$;
select pg_temp.assert_fails(pg_temp.ev('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b',
  'assessment_recorded', '{"source":"ai","score":0.9}'), '42501', 'tutor cannot record an assessment claiming to be AI');
select pg_temp.assert_fails(pg_temp.ev('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c',
  'tutor_observation', '{"level":"secure"}'), '42501', 'tutor cannot record observations about an unlinked student');
select pg_temp.assert_fails(pg_temp.ev('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b',
  'exercise_answered', '{}'), '42501', 'tutor cannot record answers on the student''s behalf');
commit;

-- ─── Others ───────────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d"}';
select pg_temp.assert((select count(*) from public.learning_events) = 0, 'unlinked tutor sees no events');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';
select pg_temp.assert((select count(*) from public.learning_events) = 0, 'another student sees no events');
commit;

begin;
set local role anon;
select pg_temp.assert_fails($$select * from public.learning_events$$, '42501', 'anon cannot read events');
commit;

-- ─── Immutable even for admins / the service role ─────────────────────────────────────────────
select pg_temp.assert_fails($$update public.learning_events set payload = '{}'$$, 'P0001', 'admin cannot edit events');
select pg_temp.assert_fails($$delete from public.learning_events$$, 'P0001', 'admin cannot delete events');
select pg_temp.assert_fails($$truncate public.learning_events$$, 'P0001', 'admin cannot truncate events');
select pg_temp.assert_fails($$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000b'$$,
  '23503', 'a student with recorded history cannot be deleted by accident');

\o
\echo 'All learning_events tests passed.'
