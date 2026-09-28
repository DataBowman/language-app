-- 0005 learner context and Phase 1 content tables (ADR 0014, docs/DATA_MODEL.md).
-- Learner context is configuration (variety, time budget, goals) — never assumed. Content (lessons,
-- challenges) is versioned; a published version is immutable. JSON content is validated by the zod
-- schemas in packages/core before it is written; the database enforces shape limits and access.
-- Every table: RLS deny-by-default, an analytics_reader read policy (ADR 0013), audit trigger.

-- ─── Learner settings: one row per learner, everything nullable = "not known yet" ──────────────────
create table public.learner_settings (
  learner_id      uuid primary key references public.profiles (id) on delete cascade,
  target_language text not null default 'es' check (target_language in ('es')),
  variety         text check (variety in ('es', 'es-ES', 'es-MX', 'es-AR', 'es-419')),
  weekly_minutes  integer check (weekly_minutes between 10 and 3000),
  quick_share     numeric(3, 2) check (quick_share between 0 and 1),
  plan_autonomy   text not null default 'auto' check (plan_autonomy in ('auto', 'tutor_approval')),
  ui_language     text not null default 'en' check (ui_language in ('en', 'es')),
  updated_at      timestamptz not null default now()
);
comment on table public.learner_settings is 'Selectable learner context (ADR 0014). NULL = unknown; see effectiveContext in packages/core.';

-- ─── Goals: selectable, several per learner, at most one active ──────────────────────────────────
create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('challenge', 'level', 'custom')),
  challenge_id uuid,
  target_level text check (target_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  description  text check (char_length(description) <= 1000),
  target_date  date,
  status       text not null default 'active' check (status in ('active', 'paused', 'achieved', 'dropped')),
  created_by   uuid default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (kind <> 'challenge' or challenge_id is not null),
  check (kind <> 'level' or target_level is not null),
  check (kind <> 'custom' or description is not null)
);
create unique index goals_one_active_per_learner on public.goals (learner_id) where status = 'active';

-- ─── Challenges: versioned scenario definitions (ADR 0012) ───────────────────────────────────────
create table public.challenges (
  id         uuid not null default gen_random_uuid(),
  version    integer not null default 1 check (version >= 1),
  status     text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  content    jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 65536
                                   and (content ->> 'schemaVersion') = '1'),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, version)
);

-- ─── Lessons: one row per version; published versions are immutable ──────────────────────────────
create table public.lessons (
  id                uuid not null default gen_random_uuid(),
  version           integer not null default 1 check (version >= 1),
  status            text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  mode              text not null check (mode in ('immersive', 'quick_pack')),
  content           jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 262144
                                          and (content ->> 'schemaVersion') = '1'),
  framework_version text not null,
  generation        jsonb,                      -- {provider, model, prompt_hash, …} when AI-generated
  created_by        uuid default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (id, version),
  check (content ->> 'mode' = mode)
);

-- ─── Assignments: a lesson version given to a learner ────────────────────────────────────────────
create table public.assignments (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null,
  lesson_version integer not null,
  learner_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_by    uuid default auth.uid() references public.profiles (id),
  due_at         timestamptz,
  status         text not null default 'open' check (status in ('open', 'done', 'withdrawn')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (lesson_id, lesson_version) references public.lessons (id, version)
);
create index assignments_learner_idx on public.assignments (learner_id);

-- ─── Media metadata (bytes live in Storage; bucket policies come with recording) ─────────────────
create table public.media (
  id          uuid primary key,                   -- generated on the device
  owner_id    uuid not null default auth.uid() references public.profiles (id),
  learner_id  uuid references public.profiles (id),  -- whose learning it belongs to (recordings)
  bucket      text not null check (bucket in ('lesson-media', 'attempt-media')),
  path        text not null check (char_length(path) <= 512),
  mime        text not null check (char_length(mime) <= 100),
  bytes       bigint not null check (bytes between 1 and 104857600),
  duration_ms integer check (duration_ms >= 0),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  captured_on text check (captured_on in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  unique (owner_id, sha256),
  unique (bucket, path)
);

-- ─── Suggestions: mutable workflow state (plans, AI proposals), never facts (ADR 0011) ───────────
create table public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('session_plan', 'observation_proposal', 'challenge_draft', 'plan_revision')),
  content     jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 65536),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired', 'applied')),
  created_by  uuid default auth.uid() references public.profiles (id),  -- NULL = server/AI
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles (id)
);
create index suggestions_learner_status_idx on public.suggestions (learner_id, status);

-- ─── Triggers ───────────────────────────────────────────────────────────────────────────────────
-- Audit rows name the changed row: id, else learner_id (learner_settings), else the link pair.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  row_key text := coalesce(r ->> 'id', r ->> 'learner_id', concat_ws(':', r ->> 'tutor_id', r ->> 'student_id'));
begin
  if r ? 'version' then row_key := row_key || '@' || (r ->> 'version'); end if;
  insert into public.audit_log (table_name, row_id, action, old, new, actor)
  values (tg_table_name, row_key, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end;
$$;

-- Published versions are frozen: only archiving is allowed. Edits create version + 1.
create function public.freeze_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' and (
       new.status not in ('published', 'archived')
       or new.content is distinct from old.content
       or new.id is distinct from old.id or new.version is distinct from old.version) then
    raise exception 'published % %/% is immutable: create a new version instead', tg_table_name, old.id, old.version;
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'archived % %/% cannot be reactivated: create a new version instead', tg_table_name, old.id, old.version;
  end if;
  return new;
end;
$$;
revoke execute on function public.freeze_published() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['learner_settings', 'goals', 'challenges', 'lessons', 'assignments', 'suggestions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t || '_audit', t);
  end loop;
end $$;
create trigger challenges_freeze before update on public.challenges for each row execute function public.freeze_published();
create trigger lessons_freeze before update on public.lessons for each row execute function public.freeze_published();

-- New learners get a settings row with everything unknown.
create function public.create_learner_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'student' then
    insert into public.learner_settings (learner_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.create_learner_settings() from public, anon, authenticated;
create trigger profiles_learner_settings after insert or update of role on public.profiles
  for each row execute function public.create_learner_settings();
insert into public.learner_settings (learner_id) select id from public.profiles where role = 'student' on conflict do nothing;

-- ─── Privileges ─────────────────────────────────────────────────────────────────────────────────
revoke all on public.learner_settings, public.goals, public.challenges, public.lessons,
  public.assignments, public.media, public.suggestions from anon, authenticated;
grant select, update on public.learner_settings to authenticated;
grant select, insert, update on public.goals, public.challenges, public.lessons, public.assignments, public.suggestions to authenticated;
grant select, insert on public.media to authenticated;

alter table public.learner_settings enable row level security;
alter table public.goals enable row level security;
alter table public.challenges enable row level security;
alter table public.lessons enable row level security;
alter table public.assignments enable row level security;
alter table public.media enable row level security;
alter table public.suggestions enable row level security;

-- ─── Policies ───────────────────────────────────────────────────────────────────────────────────
-- Learner context: the learner and their tutor may both read and change it.
create policy "learner_settings: learner and tutor" on public.learner_settings
  for all to authenticated
  using (learner_id = (select auth.uid()) or public.is_tutor_of(learner_id))
  with check (learner_id = (select auth.uid()) or public.is_tutor_of(learner_id));

create policy "goals: learner and tutor read" on public.goals
  for select to authenticated using (learner_id = (select auth.uid()) or public.is_tutor_of(learner_id));
create policy "goals: learner and tutor create" on public.goals
  for insert to authenticated
  with check ((learner_id = (select auth.uid()) or public.is_tutor_of(learner_id)) and created_by = (select auth.uid()));
create policy "goals: learner and tutor change" on public.goals
  for update to authenticated
  using (learner_id = (select auth.uid()) or public.is_tutor_of(learner_id))
  with check (learner_id = (select auth.uid()) or public.is_tutor_of(learner_id));

-- Challenges: everyone signed in reads published ones; tutors author (own drafts and versions).
create policy "challenges: read published" on public.challenges
  for select to authenticated using (status = 'published' or created_by = (select auth.uid()));
create policy "challenges: tutors author" on public.challenges
  for insert to authenticated with check (public.is_tutor() and created_by = (select auth.uid()));
create policy "challenges: tutors edit own" on public.challenges
  for update to authenticated using (public.is_tutor() and created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- Lessons: tutors author their own; learners read versions assigned to them once published, and keep
-- reading them after they are archived (their history must stay intact). Drafts are never visible.
create policy "lessons: tutors own" on public.lessons
  for all to authenticated using (public.is_tutor() and created_by = (select auth.uid()))
  with check (public.is_tutor() and created_by = (select auth.uid()));
create policy "lessons: learners read assigned published" on public.lessons
  for select to authenticated
  using (status in ('published', 'archived') and exists (
    select 1 from public.assignments a
    where a.lesson_id = lessons.id and a.lesson_version = lessons.version
      and a.learner_id = (select auth.uid()) and a.status <> 'withdrawn'));

-- Assignments: tutors manage for their students; learners read their own.
create policy "assignments: learners read own" on public.assignments
  for select to authenticated using (learner_id = (select auth.uid()));
create policy "assignments: tutors manage" on public.assignments
  for all to authenticated using (public.is_tutor_of(learner_id))
  with check (public.is_tutor_of(learner_id) and assigned_by = (select auth.uid()));

-- Media: owners insert their own; the learner it belongs to and their tutor can read it.
create policy "media: owners insert" on public.media
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (learner_id is null or learner_id = (select auth.uid()) or public.is_tutor_of(learner_id)));
create policy "media: read own, own learning, or own students'" on public.media
  for select to authenticated
  using (owner_id = (select auth.uid()) or learner_id = (select auth.uid()) or public.is_tutor_of(learner_id));

-- Suggestions: tutor-facing workflow; learners do not see them.
create policy "suggestions: tutors" on public.suggestions
  for all to authenticated using (public.is_tutor_of(learner_id)) with check (public.is_tutor_of(learner_id));

-- Engineering read access (ADR 0013).
create policy "analytics_reader: read all" on public.learner_settings for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.goals            for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.challenges       for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.lessons          for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.assignments      for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.media            for select to analytics_reader using (true);
create policy "analytics_reader: read all" on public.suggestions      for select to analytics_reader using (true);
