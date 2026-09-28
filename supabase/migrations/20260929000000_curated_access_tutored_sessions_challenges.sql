-- 0003 who sees learning data, tutored sessions, challenge events (ADRs 0010–0012).
--
-- * Learners no longer read the raw ledger: they get a curated progress view computed on the server
--   (packages/core buildStudentProgress). Tutors — and any AI acting as the tutor — read everything
--   about their own students. Learners still write their own events (insert needs no read access).
-- * New event types: tutored_session_logged (tutor), challenge_started/_rehearsed/_completed (learner).

-- ─── Event types ────────────────────────────────────────────────────────────────────────────────
alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check check (type in (
  'session_started', 'session_paused', 'session_resumed', 'session_ended',
  'exercise_presented', 'exercise_answered', 'exercise_skipped', 'hint_revealed',
  'audio_replayed', 'gloss_looked_up', 'recording_submitted', 'self_rated',
  'assessment_recorded', 'session_rated', 'content_reported', 'practice_logged',
  'challenge_started', 'challenge_rehearsed', 'challenge_completed',
  'tutored_session_logged', 'tutor_observation', 'screen_viewed'));

-- ─── Helper ─────────────────────────────────────────────────────────────────────────────────────
create function public.is_tutor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'tutor');
$$;
revoke execute on function public.is_tutor() from public, anon;
grant execute on function public.is_tutor() to authenticated;

-- ─── Read access: tutors only (their students, and their own records) ───────────────────────────
drop policy "learning_events: read own, own students', or own records" on public.learning_events;
create policy "learning_events: tutors read students' and own events" on public.learning_events
  for select to authenticated
  using (public.is_tutor_of(learner_id) or (actor_id = (select auth.uid()) and public.is_tutor()));

-- ─── Write access: learners record about themselves; tutors record tutor events for their students ─
drop policy "learning_events: insert as self" on public.learning_events;
create policy "learning_events: insert as self" on public.learning_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and (
      (learner_id = (select auth.uid())
        and type not in ('tutored_session_logged', 'tutor_observation', 'assessment_recorded'))
      or (
        public.is_tutor_of(learner_id)
        and (type in ('tutored_session_logged', 'tutor_observation')
             or (type = 'assessment_recorded' and payload ->> 'source' = 'tutor'))
      )
    )
  );
