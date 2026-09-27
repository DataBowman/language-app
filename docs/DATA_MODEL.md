# Data model

> **Provisional.** The entities the AI needs (goals, curriculum graph, plans, mastery, provenance, lexicon) are defined by [CONTENT_FRAMEWORK.md §8](CONTENT_FRAMEWORK.md). This schema will be finalised after that framework's open questions (§10) are answered.

This is a draft. It becomes `supabase/migrations/0001_init.sql` in Phase 0. All ids are UUIDs made by the client. All times are `timestamptz` in UTC.

## Tables

```
profiles            one row per auth user
  id (= auth.users.id) · display_name · role ('student'|'tutor') · created_at

tutor_students      which tutor can see which student (supports more students later)
  tutor_id · student_id · created_at                           PK (tutor_id, student_id)

lessons             one row per lesson *version*; published versions are immutable
  id · version · status ('draft'|'published'|'archived')
  title · cefr_level ('A1'..'C2') · tags text[]
  mode ('immersive'|'quick_pack')  ← quick_pack = a tutor-curated drill set; quick sessions
                                     can also draw drills from immersive lessons
  est_minutes int
  content jsonb            ← LessonContent (validated by packages/core)
  schema_version int       ← version of the LessonContent format itself
  generation jsonb null    ← {model, prompt_hash, created_at} when made by AI
  created_by · created_at · updated_at · deleted_at
  PK (id, version)

assignments         tutor gives a lesson to a student
  id · lesson_id · lesson_version · student_id · assigned_by · due_at · created_at · updated_at · deleted_at

media               metadata for each stored file (the bytes live in Storage)
  id · owner_id · bucket · path · mime · bytes · duration_ms · sha256
  captured_on ('ios'|'android'|'web')  ← browsers record different formats (WebM/Opus vs MP4/AAC)
  created_at
  UNIQUE (owner_id, sha256)      ← uploading the same file twice is harmless

sessions            one row per study session (written by the student)
  id · student_id · mode ('immersive'|'quick') · assignment_id null (immersive)
  planned_seconds · started_at · ended_at null · platform ('ios'|'android'|'web')
  composer_version text null        ← quick mode: which SessionComposer built it (reproducible)
  created_at · updated_at

attempts            APPEND-ONLY: one row per exercise answer
  id · student_id · session_id · assignment_id null · lesson_id · lesson_version · exercise_id
  review_item_id null      ← quick-mode drills of an FSRS card
  hints_used int default 0 ← immersive: how often the translation/hint was revealed
  response jsonb           ← {kind:'audio'|'video'|'photo'|'choice'|'text', media_id?, value?}
  auto_score numeric null  ← deterministic scoring on the device, if the exercise has one
  client_created_at · created_at (server)

assessments         APPEND-ONLY: AI or tutor judgement of an attempt
  id · attempt_id · source ('ai'|'tutor') · transcript text null
  score numeric null · feedback jsonb · model text null · created_by · created_at

review_items        FSRS spaced-repetition cards (vocabulary / phrases / grammar points)
  id · student_id · key (e.g. 'vocab:el perro') · fsrs_state jsonb · due_at · updated_at

audit_log           filled by triggers on lessons/assignments/profiles
  id · table_name · row_id · action · old jsonb · new jsonb · actor · at
```

Progress is **views** (for example `v_student_skill_progress`, `v_weekly_activity`, `v_immersive_quality`, `v_quick_retention`), all split by `sessions.mode`, calculated from `attempts` and `assessments`. There is no stored "progress" counter that could drift or become corrupted.

## LessonContent (JSON, validated with zod in `packages/core`)

```jsonc
{
  "schemaVersion": 1,
  "mode": "immersive",
  "objectives": ["Talk about your morning routine using reflexive verbs"],
  "vocabulary": [{ "es": "despertarse", "en": "to wake up", "mediaId": null }],
  "exercises": [
    { "id": "ex1", "type": "listen_repeat",   "prompt": { "text": "Me despierto a las siete." }, "tts": true },
    { "id": "ex2", "type": "describe_image",  "prompt": { "mediaId": "…", "text": "¿Qué hace la persona?" }, "answer": { "kind": "audio" } },
    { "id": "ex3", "type": "multiple_choice", "prompt": { "text": "Yo ___ a las ocho." }, "options": ["me levanto", "se levanta"], "correct": 0 },
    { "id": "ex4", "type": "video_response",  "prompt": { "text": "Describe tu rutina en 30 segundos." }, "answer": { "kind": "video", "maxSeconds": 30 } }
  ]
}
```

### Exercise types and modes

Each type is declared once in `packages/core` with metadata that the player, the `SessionComposer` and the lesson generator all read:

| Type | Immersive | Quick | Auto-scored | Needs AI/tutor | Web note |
|---|:-:|:-:|:-:|:-:|---|
| `flashcard` (es↔en / picture↔word) | – | ✔ | ✔ (self-graded: again/hard/good/easy) | – | |
| `multiple_choice` | ✔ | ✔ | ✔ | – | |
| `listen_choose` (audio → pick the meaning) | ✔ | ✔ | ✔ | – | TTS may use server audio |
| `word_order` | ✔ | ✔ | ✔ | – | |
| `type_answer` | ✔ | ✔ | ✔ (normalised match) | – | keyboard-friendly on the web |
| `listen_repeat` | ✔ | – (needs speech-to-text) | partly (transcript match) | STT | server STT on the web |
| `describe_image` | ✔ | – | – | AI + tutor | |
| `video_response` | ✔ | – | – | AI + tutor | MediaRecorder |
| `conversation` (turn-based role-play) | ✔ | – | – | AI (LLM + STT) | |

Rule: **quick sessions may only use auto-scored types**, so they work offline with no AI cost.

Exercise types are a closed, versioned list. The lesson player renders only the types it knows. A new type means a `schemaVersion` bump plus a migration function in `packages/core`. Old lessons stay readable forever.

## Access rules (RLS)

Deny by default. Every table has RLS enabled.

| Table | Student | Tutor |
|---|---|---|
| profiles | read own | read own + their students |
| lessons | read `published` versions assigned to them | full access to their own lessons |
| assignments | read own | create/update for their students |
| media | insert/read own | read their students' media; insert own (lesson media) |
| sessions | insert/update own (only `ended_at`) | read their students' sessions |
| attempts | **insert** + read own; no update/delete | read their students' attempts |
| assessments | read those on own attempts | insert `source='tutor'` for their students; read |
| review_items | read/write own | read their students' items |
| audit_log | none | read |

`source='ai'` assessments are written only by edge functions using the service role, never directly by clients.
