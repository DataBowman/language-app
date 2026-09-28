/**
 * Learning event ledger (ADR 0009, docs/LEARNING_DATA.md): small, immutable facts recorded as they
 * happen. Everything else (scores, mastery, known words, pace) is derived from these later.
 *
 * Adding a field: make it optional. Changing a field's meaning: bump that event's `v`.
 * Adding an event type: also add it to the CHECK constraint in the learning_events migration
 * (a unit test keeps the two lists in sync).
 */
import { z } from 'zod';
import { OBJECTIVE_ID } from './curriculum';
import { ErrorTag } from './errors';
import { EXERCISE_TYPES } from './exercise-types';

const uuid = z.uuid();
const lemma = z.string().trim().min(1).max(100);
const seconds = z.number().min(0).max(86_400);
const ms = z.number().int().min(0).max(86_400_000);
const note = z.string().max(500).optional();

/** Which exercise an event is about: enough to trace it back to the exact content version. */
export const ExerciseContext = z.object({
  lessonId: uuid,
  lessonVersion: z.number().int().min(1),
  exerciseId: z.string().min(1).max(64),
  exerciseType: z.enum(EXERCISE_TYPES),
  mode: z.enum(['immersive', 'quick']),
  objectiveIds: z.array(OBJECTIVE_ID).min(1),
  lemmas: z.array(lemma).default([]),
});
export type ExerciseContext = z.infer<typeof ExerciseContext>;

const Response = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), index: z.number().int().min(0) }),
  z.object({ kind: z.literal('text'), value: z.string().max(1000) }),
  z.object({ kind: z.literal('order'), tokens: z.array(z.string().max(100)).max(30) }),
  z.object({ kind: z.literal('media'), mediaId: uuid }),
]);

/** Payload schema per event type. */
export const EVENT_PAYLOADS = {
  // ─── Session ───
  session_started: z.object({
    mode: z.enum(['immersive', 'quick']),
    plannedSeconds: seconds,
    entryPoint: z.enum(['home', 'notification', 'review', 'other']).default('home'),
    lessonId: uuid.optional(),
  }),
  session_paused: z.object({ reason: z.enum(['backgrounded', 'tab_hidden', 'interrupted', 'user']) }),
  session_resumed: z.object({ pausedSeconds: seconds }),
  session_ended: z.object({
    outcome: z.enum(['completed', 'abandoned', 'timed_out']),
    activeSeconds: seconds,
  }),

  // ─── Exercise ───
  exercise_presented: z.object({ ctx: ExerciseContext }),
  exercise_answered: z.object({
    ctx: ExerciseContext,
    response: Response,
    /** 'pending' = waiting for AI/tutor assessment (spoken and video answers). */
    result: z.enum(['correct', 'partial', 'wrong', 'pending']),
    score: z.number().min(0).max(1).nullable(),
    answerClass: z.enum(['correct', 'accent_only', 'minor_typo', 'wrong']).optional(),
    latencyMs: z.object({ firstInput: ms.optional(), submit: ms }),
    tryNumber: z.number().int().min(1).default(1),
    errorTags: z.array(ErrorTag).default([]),
  }),
  exercise_skipped: z.object({ ctx: ExerciseContext, secondsSpent: seconds }),
  hint_revealed: z.object({ ctx: ExerciseContext, hintIndex: z.number().int().min(0).default(0), secondsAfterPresented: seconds }),
  audio_replayed: z.object({ ctx: ExerciseContext, replayCount: z.number().int().min(1), slowed: z.boolean().default(false) }),
  gloss_looked_up: z.object({ ctx: ExerciseContext.optional(), lemma, surface: z.string().max(100).optional() }),
  recording_submitted: z.object({
    ctx: ExerciseContext,
    mediaId: uuid,
    durationMs: ms,
    rerecords: z.number().int().min(0).default(0),
  }),
  self_rated: z.object({ ctx: ExerciseContext, rating: z.enum(['again', 'hard', 'good', 'easy']) }),

  // ─── Assessment (AI via server, or tutor) ───
  assessment_recorded: z.object({
    ctx: ExerciseContext,
    answerEventId: uuid,
    source: z.enum(['ai', 'tutor']),
    score: z.number().min(0).max(1).nullable(),
    objectiveScores: z.record(OBJECTIVE_ID, z.number().min(0).max(1)).optional(),
    lemmaScores: z.record(lemma, z.number().min(0).max(1)).optional(),
    errorTags: z.array(ErrorTag).default([]),
    transcript: z.string().max(5000).optional(),
    wordsPerMinute: z.number().min(0).max(400).optional(),
    pauseRatio: z.number().min(0).max(1).optional(),
    model: z.string().max(100).optional(),
    feedback: z.string().max(2000).optional(),
  }),

  // ─── Learner voice ───
  session_rated: z.object({
    difficulty: z.enum(['too_easy', 'about_right', 'too_hard']),
    enjoyed: z.boolean().optional(),
    note,
  }),
  content_reported: z.object({
    ctx: ExerciseContext,
    reason: z.enum(['wrong_answer', 'unclear', 'audio_problem', 'image_problem', 'inappropriate', 'other']),
    note,
  }),
  practice_logged: z.object({
    activity: z.enum(['conversation', 'class', 'tv_video', 'podcast_music', 'reading', 'writing', 'other']),
    minutes: z.number().int().min(1).max(600),
    note,
  }),

  // ─── Tutor ───
  tutor_observation: z.object({
    objectiveIds: z.array(OBJECTIVE_ID).default([]),
    lemmas: z.array(lemma).default([]),
    level: z.enum(['struggling', 'progressing', 'secure']),
    minutes: z.number().int().min(1).max(600).optional(),
    note,
  }),

  // ─── Product usage ───
  screen_viewed: z.object({ route: z.string().min(1).max(200) }),
} as const;

export type EventType = keyof typeof EVENT_PAYLOADS;
export const EVENT_TYPES = Object.keys(EVENT_PAYLOADS) as EventType[];

/** Events a tutor may record about a student; every other type is recorded by the learner themself. */
export const TUTOR_EVENT_TYPES = ['tutor_observation', 'assessment_recorded'] as const satisfies readonly EventType[];

const Envelope = {
  id: uuid,
  v: z.literal(1),
  /** The student the fact is about. Equals the actor except for tutor and AI events. */
  learnerId: uuid,
  sessionId: uuid.nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
  seq: z.number().int().min(0),
  deviceId: z.string().min(1).max(64),
  platform: z.enum(['ios', 'android', 'web', 'server']),
  appVersion: z.string().min(1).max(32),
  tzOffsetMin: z.number().int().min(-840).max(840),
};

type Variant<T extends EventType> = z.ZodObject<typeof Envelope & { type: z.ZodLiteral<T>; payload: (typeof EVENT_PAYLOADS)[T] }>;

const variants = EVENT_TYPES.map((type) =>
  z.object({ ...Envelope, type: z.literal(type), payload: EVENT_PAYLOADS[type] }),
) as unknown as [Variant<EventType>, ...Variant<EventType>[]];

/** A fully typed event, narrowed by `type`. */
export type LearningEvent = {
  [T in EventType]: Omit<z.infer<Variant<T>>, 'type' | 'payload'> & { type: T; payload: z.infer<(typeof EVENT_PAYLOADS)[T]> };
}[EventType];

// Built from a mapped list, so TypeScript cannot infer the per-type union itself; declare it.
export const LearningEvent = z.discriminatedUnion('type', variants) as unknown as z.ZodType<LearningEvent>;

/** Largest payload the database accepts (bytes of JSON). */
export const MAX_PAYLOAD_BYTES = 16_384;
