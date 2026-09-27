-- RLS and privilege tests for 20260927000000_init.sql. Every block must pass; any failure aborts.
-- Users: tutor T, student S (linked to T), other student O (not linked), other tutor T2.
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

-- Runs sql and asserts it fails with the given SQLSTATE (42501 = insufficient_privilege).
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

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ─── Seed (as admin) ──────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 't@example.com',  '{"role":"tutor","display_name":"Tutor"}'),
  ('00000000-0000-0000-0000-00000000000b', 's@example.com',  '{"role":"student","display_name":"Student"}'),
  ('00000000-0000-0000-0000-00000000000c', 'o@example.com',  '{"role":"student"}'),
  ('00000000-0000-0000-0000-00000000000d', 't2@example.com', '{"role":"tutor"}'),
  ('00000000-0000-0000-0000-00000000000e', 'x@example.com',  '{"role":"admin"}');
insert into public.tutor_students (tutor_id, student_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

select pg_temp.assert((select count(*) from public.profiles) = 5, 'a profile is created for every auth user');
select pg_temp.assert((select role from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'student', 'role taken from invite metadata');
select pg_temp.assert((select role from public.profiles where id = '00000000-0000-0000-0000-00000000000e') is null, 'unknown role in metadata is ignored');
select pg_temp.assert_fails($$insert into public.tutor_students values ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c')$$,
  'P0001', 'a student cannot be linked as a tutor');

-- ─── Student S ────────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';

select pg_temp.assert((select array_agg(display_name order by display_name) from public.profiles) = array['Student','Tutor'],
  'student sees own profile and own tutor only');
select pg_temp.assert((select count(*) from public.tutor_students) = 1, 'student sees own link');
select pg_temp.assert((select count(*) from public.audit_log) = 0, 'student cannot read the audit log');

update public.profiles set display_name = 'Estudiante' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.assert((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Estudiante', 'student can rename self');

update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.assert((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Tutor', 'student cannot rename the tutor');

select pg_temp.assert_fails($$update public.profiles set role = 'tutor' where id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', 'student cannot change own role');
select pg_temp.assert_fails($$insert into public.tutor_students values ('00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000b')$$,
  '42501', 'student cannot link themselves to another tutor');
select pg_temp.assert_fails($$delete from public.tutor_students$$, '42501', 'student cannot remove links');
select pg_temp.assert_fails($$insert into public.audit_log (table_name,row_id,action) values ('x','1','INSERT')$$,
  '42501', 'student cannot forge audit entries');
select pg_temp.assert_fails($$delete from public.profiles$$, '42501', 'student cannot delete profiles');
commit;

-- ─── Tutor T ──────────────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';

select pg_temp.assert((select count(*) from public.profiles) = 2, 'tutor sees self and own student, not others');
select pg_temp.assert(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 'tutor cannot see an unlinked student');
select pg_temp.assert(exists (select 1 from public.audit_log where actor = '00000000-0000-0000-0000-00000000000b' and action = 'UPDATE'),
  'tutor sees their student''s changes in the audit log');
select pg_temp.assert_fails($$update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', 'tutor cannot change roles');
commit;

-- ─── Other tutor T2 ───────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d"}';
select pg_temp.assert((select count(*) from public.profiles) = 1, 'unlinked tutor sees only self');
select pg_temp.assert((select count(*) from public.audit_log) = 0, 'unlinked tutor sees no audit entries about others');
commit;

-- ─── Not signed in ────────────────────────────────────────────────────────────────────────────
begin;
set local role anon;
select pg_temp.assert_fails($$select * from public.profiles$$, '42501', 'anon cannot read profiles');
select pg_temp.assert_fails($$select * from public.tutor_students$$, '42501', 'anon cannot read links');
select pg_temp.assert_fails($$select * from public.audit_log$$, '42501', 'anon cannot read the audit log');
commit;

-- ─── Every public table has RLS enabled ───────────────────────────────────────────────────────
select pg_temp.assert(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
), 'every table in public has row level security enabled');

\echo 'All RLS tests passed.'
