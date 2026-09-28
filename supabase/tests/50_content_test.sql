-- Tests for 20261001000000_content_and_context.sql (ADR 0014). Uses users seeded by 10_:
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

grant execute on all functions in schema pg_temp to authenticated;

-- A minimal valid lesson document (shape is validated by packages/core; the DB checks the envelope).
create function pg_temp.lesson_json(mode text default 'immersive') returns jsonb language sql as $$
  select jsonb_build_object('schemaVersion', 1, 'mode', mode, 'title', 'Test', 'exercises', '[]'::jsonb)
$$;
grant execute on function pg_temp.lesson_json(text) to authenticated;

select pg_temp.assert((select count(*) from public.learner_settings) = 2, 'every student (and no tutor) gets a settings row');
select pg_temp.assert((select variety is null and weekly_minutes is null and plan_autonomy = 'auto'
  from public.learner_settings where learner_id = '00000000-0000-0000-0000-00000000000b'), 'settings start unknown, plan changes automatic');

-- ─── Student S: own context ───────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
update public.learner_settings set variety = 'es-MX' where learner_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.assert((select variety from public.learner_settings) = 'es-MX', 'student chooses a variety and sees only their own settings');
select pg_temp.assert_fails($$update public.learner_settings set variety = 'fr-FR'$$, '23514', 'unknown varieties are rejected');
select pg_temp.assert_fails($$insert into public.learner_settings (learner_id) values ('00000000-0000-0000-0000-00000000000c')$$, '42501', 'student cannot create settings');

insert into public.goals (id, learner_id, kind, challenge_id, target_date)
values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'challenge', '50000000-0000-0000-0000-0000000000c1', '2027-03-01');
select pg_temp.assert_fails($$insert into public.goals (learner_id, kind, target_level) values ('00000000-0000-0000-0000-00000000000b', 'level', 'B1')$$,
  '23505', 'only one active goal at a time');
update public.goals set status = 'paused' where id = '50000000-0000-0000-0000-000000000001';
insert into public.goals (learner_id, kind, target_level) values ('00000000-0000-0000-0000-00000000000b', 'level', 'B1');
select pg_temp.assert_fails($$insert into public.goals (learner_id, kind) values ('00000000-0000-0000-0000-00000000000b', 'level')$$,
  '23514', 'a level goal needs a target level');
select pg_temp.assert_fails($$insert into public.goals (learner_id, kind, description) values ('00000000-0000-0000-0000-00000000000c', 'custom', 'x')$$,
  '42501', 'student cannot set goals for another student');
select pg_temp.assert_fails($$insert into public.lessons (mode, content, framework_version) values ('immersive', pg_temp.lesson_json(), '0.1.0')$$,
  '42501', 'student cannot author lessons');
commit;

-- ─── Tutor T: context, lessons, assignments, challenges, suggestions ─────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
update public.learner_settings set weekly_minutes = 120 where learner_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.assert((select weekly_minutes from public.learner_settings where learner_id = '00000000-0000-0000-0000-00000000000b') = 120, 'tutor can adjust their student''s context');
select pg_temp.assert(not exists (select 1 from public.learner_settings where learner_id = '00000000-0000-0000-0000-00000000000c'), 'tutor cannot see an unlinked student''s settings');
update public.goals set status = 'achieved' where learner_id = '00000000-0000-0000-0000-00000000000b' and kind = 'level';
select pg_temp.assert((select count(*) from public.goals where status = 'achieved') = 1, 'tutor can update a goal the student created');

insert into public.lessons (id, mode, content, framework_version) values ('50000000-0000-0000-0000-0000000000a1', 'immersive', pg_temp.lesson_json(), '0.1.0');
select pg_temp.assert_fails($$insert into public.lessons (mode, content, framework_version) values ('quick_pack', pg_temp.lesson_json('immersive'), '0.1.0')$$,
  '23514', 'the mode column must match the content');
select pg_temp.assert_fails($$insert into public.lessons (mode, content, framework_version) values ('immersive', '{"schemaVersion":2,"mode":"immersive"}', '0.1.0')$$,
  '23514', 'unknown content schema versions are rejected');
update public.lessons set content = content || '{"title":"Edited draft"}' where id = '50000000-0000-0000-0000-0000000000a1';
update public.lessons set status = 'published' where id = '50000000-0000-0000-0000-0000000000a1';
select pg_temp.assert_fails($$update public.lessons set content = content || '{"title":"Sneaky edit"}' where id = '50000000-0000-0000-0000-0000000000a1'$$,
  'P0001', 'a published lesson cannot be edited');
insert into public.lessons (id, version, mode, content, framework_version, status)
values ('50000000-0000-0000-0000-0000000000a1', 2, 'immersive', pg_temp.lesson_json() || '{"title":"v2"}', '0.1.0', 'draft');

insert into public.assignments (id, lesson_id, lesson_version, learner_id)
values ('50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-00000000000b');
-- Assigning a draft by mistake must not reveal it before it is published.
insert into public.assignments (lesson_id, lesson_version, learner_id)
values ('50000000-0000-0000-0000-0000000000a1', 2, '00000000-0000-0000-0000-00000000000b');
select pg_temp.assert_fails($$insert into public.assignments (lesson_id, lesson_version, learner_id) values ('50000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-00000000000c')$$,
  '42501', 'tutor cannot assign to an unlinked student');

insert into public.challenges (id, content) values ('50000000-0000-0000-0000-0000000000c1', '{"schemaVersion":1,"title":"Greet a colleague"}');
insert into public.suggestions (learner_id, kind, content) values ('00000000-0000-0000-0000-00000000000b', 'session_plan', '{"items":[]}');
commit;

-- ─── Student S: sees what was assigned and published, nothing else ───────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select pg_temp.assert((select count(*) from public.lessons) = 1, 'student sees exactly the assigned, published version');
select pg_temp.assert((select version from public.lessons) = 1, 'the draft v2 is not visible to the student, even though it is assigned');
select pg_temp.assert((select count(*) from public.assignments) = 2, 'student sees their assignments');
select pg_temp.assert((select count(*) from public.challenges) = 0, 'student does not see draft challenges');
select pg_temp.assert((select count(*) from public.suggestions) = 0, 'student does not see tutor suggestions');

insert into public.media (id, learner_id, bucket, path, mime, bytes, sha256, captured_on)
values ('50000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000b', 'attempt-media', 'b/rec1.m4a', 'audio/mp4', 12345, repeat('a', 64), 'web');
select pg_temp.assert_fails($$insert into public.media (id, owner_id, bucket, path, mime, bytes, sha256) values ('50000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000a', 'attempt-media', 'x', 'audio/mp4', 1, repeat('b', 64))$$,
  '42501', 'student cannot upload media in someone else''s name');
commit;

-- ─── Tutor T: publishes the challenge, archives v1; S then sees the challenge ─────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
update public.challenges set status = 'published' where id = '50000000-0000-0000-0000-0000000000c1';
update public.lessons set status = 'archived' where id = '50000000-0000-0000-0000-0000000000a1' and version = 1;
select pg_temp.assert_fails($$update public.lessons set status = 'published' where id = '50000000-0000-0000-0000-0000000000a1' and version = 1$$,
  'P0001', 'an archived lesson cannot be republished');
select pg_temp.assert(exists (select 1 from public.media where id = '50000000-0000-0000-0000-0000000000d1'), 'tutor can hear their student''s recordings');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select pg_temp.assert((select count(*) from public.challenges) = 1, 'student sees published challenges');
select pg_temp.assert((select status from public.lessons where version = 1) = 'archived', 'an archived lesson the student studied stays readable');
commit;

-- ─── Outsiders ────────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d"}';
select pg_temp.assert((select count(*) from public.lessons) + (select count(*) from public.assignments) + (select count(*) from public.goals)
  + (select count(*) from public.media) + (select count(*) from public.suggestions) + (select count(*) from public.learner_settings) = 0,
  'an unlinked tutor sees none of T''s lessons or S''s data');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';
select pg_temp.assert((select count(*) from public.media) + (select count(*) from public.goals) + (select count(*) from public.lessons) = 0,
  'another student sees none of S''s data');
commit;

select pg_temp.assert((select row_id from public.audit_log where table_name = 'learner_settings' order by id limit 1) = '00000000-0000-0000-0000-00000000000b',
  'audit rows for learner_settings name the learner');
select pg_temp.assert(exists (select 1 from public.audit_log where table_name = 'lessons' and row_id = '50000000-0000-0000-0000-0000000000a1@1'),
  'audit rows for versioned tables include the version');

\o
\echo 'All content and context tests passed.'
