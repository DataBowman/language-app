-- 0001 init: identity, roles, tutor↔student links and the audit log.
-- Only the parts that do not depend on the open content-framework questions (docs/CONTENT_FRAMEWORK.md §10).
-- Lessons, curriculum, plans and attempts follow in later migrations once that framework is settled.
--
-- Security model (docs/ARCHITECTURE.md §6): RLS is enabled on every table and denies by default.
-- Clients never write roles or links; those are set by an admin (service role) when inviting users.

-- ─── Roles ──────────────────────────────────────────────────────────────────────────────────────
create type public.app_role as enum ('student', 'tutor');

-- ─── Profiles: one row per auth user ────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  -- NULL until an admin assigns it; the app shows a "no role yet" screen.
  role         public.app_role,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'One row per user. role is admin-managed; users may only change display_name.';

-- ─── Tutor ↔ student links (supports more students later) ───────────────────────────────────────
create table public.tutor_students (
  tutor_id   uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tutor_id, student_id),
  check (tutor_id <> student_id)
);
create index tutor_students_student_idx on public.tutor_students (student_id);
comment on table public.tutor_students is 'Which tutor may see which student''s data. Admin-managed.';

-- ─── Audit log: filled only by triggers ─────────────────────────────────────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old        jsonb,
  new        jsonb,
  actor      uuid,
  at         timestamptz not null default now()
);
create index audit_log_table_row_idx on public.audit_log (table_name, row_id);
comment on table public.audit_log is 'Append-only change history written by triggers (ADR 0005).';

-- ─── Helper functions ───────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can consult tutor_students without recursive RLS checks.
-- search_path is pinned to '' so every object is schema-qualified and cannot be hijacked.
create function public.is_tutor_of(student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tutor_students ts
    where ts.tutor_id = (select auth.uid()) and ts.student_id = student
  );
$$;

create function public.is_student_of(tutor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tutor_students ts
    where ts.student_id = (select auth.uid()) and ts.tutor_id = tutor
  );
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_key text := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id',
                           concat_ws(':', to_jsonb(coalesce(new, old)) ->> 'tutor_id', to_jsonb(coalesce(new, old)) ->> 'student_id'));
begin
  insert into public.audit_log (table_name, row_id, action, old, new, actor)
  values (tg_table_name, row_key, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end;
$$;

-- A link must join a tutor to a student, never two students or two tutors.
create function public.check_tutor_student_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select role from public.profiles where id = new.tutor_id) is distinct from 'tutor' then
    raise exception 'tutor_id % does not have role tutor', new.tutor_id;
  end if;
  if (select role from public.profiles where id = new.student_id) is distinct from 'student' then
    raise exception 'student_id % does not have role student', new.student_id;
  end if;
  return new;
end;
$$;

-- New auth users get a profile. The role comes from invite metadata set by an admin
-- (auth.admin.inviteUserByEmail(email, { data: { role: 'student' } })); anything else leaves it NULL.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80),
    case when requested in ('student', 'tutor') then requested::public.app_role end
  );
  return new;
end;
$$;

-- ─── Triggers ───────────────────────────────────────────────────────────────────────────────────
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();
create trigger tutor_students_roles before insert or update on public.tutor_students
  for each row execute function public.check_tutor_student_roles();
create trigger tutor_students_audit after insert or update or delete on public.tutor_students
  for each row execute function public.write_audit_log();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Privileges ─────────────────────────────────────────────────────────────────────────────────
-- Supabase grants broad table privileges to anon/authenticated by default; narrow them explicitly,
-- then let RLS decide which rows. anon (not signed in) gets nothing at all.
revoke all on public.profiles, public.tutor_students, public.audit_log from anon, authenticated;
grant select on public.profiles, public.tutor_students, public.audit_log to authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke execute on function public.is_tutor_of(uuid), public.is_student_of(uuid) from public, anon;
grant execute on function public.is_tutor_of(uuid), public.is_student_of(uuid) to authenticated;
revoke execute on function public.write_audit_log(), public.handle_new_user(),
  public.check_tutor_student_roles(), public.touch_updated_at() from public, anon, authenticated;

-- ─── Row Level Security ─────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.tutor_students enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles: read self, own students, own tutors" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_tutor_of(id) or public.is_student_of(id));

create policy "profiles: update own row" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "tutor_students: read own links" on public.tutor_students
  for select to authenticated
  using (tutor_id = (select auth.uid()) or student_id = (select auth.uid()));

create policy "audit_log: tutors read their own and their students' changes" on public.audit_log
  for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'tutor')
    and (actor = (select auth.uid()) or public.is_tutor_of(actor))
  );
