-- 0002 learning event ledger (ADR 0009, docs/LEARNING_DATA.md).
-- Small immutable facts recorded as they happen; scores, mastery, known words and pace are derived later.
-- Payloads are validated by the zod schema in packages/core (events.ts). The database enforces the
-- envelope, who may write what, size limits and immutability.

create table public.learning_events (
  id            uuid primary key,                         -- generated on the device: retries are harmless
  type          text not null check (type in (
                  'session_started', 'session_paused', 'session_resumed', 'session_ended',
                  'exercise_presented', 'exercise_answered', 'exercise_skipped', 'hint_revealed',
                  'audio_replayed', 'gloss_looked_up', 'recording_submitted', 'self_rated',
                  'assessment_recorded', 'session_rated', 'content_reported', 'practice_logged',
                  'tutor_observation', 'screen_viewed')),
  v             smallint not null default 1 check (v >= 1),
  -- Who recorded it (NULL = the server, e.g. an AI assessment) and which student it is about.
  actor_id      uuid default auth.uid() references public.profiles (id) on delete restrict,
  learner_id    uuid not null references public.profiles (id) on delete restrict,
  session_id    uuid,
  occurred_at   timestamptz not null,                     -- device clock
  received_at   timestamptz not null default now(),       -- server clock (always set by trigger)
  seq           bigint not null check (seq >= 0),         -- per-device order
  device_id     text not null check (char_length(device_id) between 1 and 64),
  platform      text not null check (platform in ('ios', 'android', 'web', 'server')),
  app_version   text not null check (char_length(app_version) between 1 and 32),
  tz_offset_min smallint not null check (tz_offset_min between -840 and 840),
  payload       jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  -- A device clock more than a day ahead of the server is wrong; reject rather than store bad timing.
  check (occurred_at <= received_at + interval '1 day')
);
comment on table public.learning_events is
  'Append-only learning facts (ADR 0009). Never updated or deleted; everything else is derived from them.';

create index learning_events_learner_time_idx on public.learning_events (learner_id, occurred_at);
create index learning_events_session_idx on public.learning_events (session_id) where session_id is not null;
create index learning_events_type_time_idx on public.learning_events (type, occurred_at);

-- The server decides when an event arrived; a client-supplied value is ignored.
create function public.stamp_received_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := now();
  return new;
end;
$$;

-- Immutability for every role, including the service role. Removing a user's history is a deliberate
-- admin act: disable this trigger in a reviewed migration, never ad hoc.
create function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op;
end;
$$;

create trigger learning_events_received before insert on public.learning_events
  for each row execute function public.stamp_received_at();
create trigger learning_events_immutable before update or delete on public.learning_events
  for each row execute function public.forbid_change();
create trigger learning_events_no_truncate before truncate on public.learning_events
  for each statement execute function public.forbid_change();

revoke execute on function public.stamp_received_at(), public.forbid_change() from public, anon, authenticated;

-- ─── Privileges and RLS ─────────────────────────────────────────────────────────────────────────
revoke all on public.learning_events from anon, authenticated;
grant select, insert on public.learning_events to authenticated;

alter table public.learning_events enable row level security;

create policy "learning_events: read own, own students', or own records" on public.learning_events
  for select to authenticated
  using (learner_id = (select auth.uid()) or actor_id = (select auth.uid()) or public.is_tutor_of(learner_id));

-- Learners record facts about themselves. Tutors record observations and their own assessments,
-- only for their own students. AI assessments come from the server (service role, actor_id NULL).
create policy "learning_events: insert as self" on public.learning_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and (
      (learner_id = (select auth.uid()) and type not in ('tutor_observation', 'assessment_recorded'))
      or (
        public.is_tutor_of(learner_id)
        and (type = 'tutor_observation' or (type = 'assessment_recorded' and payload ->> 'source' = 'tutor'))
      )
    )
  );
