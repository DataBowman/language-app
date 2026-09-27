/**
 * LessonContent v1 — the contract between the AI generator, the tutor's editor and the lesson player.
 * Provisional until docs/CONTENT_FRAMEWORK.md §10 is answered; bump LESSON_SCHEMA_VERSION on breaking change.
 */
import { z } from 'zod';
import { CEFR_LEVELS, VARIETIES } from './framework';
import { OBJECTIVE_ID } from './curriculum';

export const LESSON_SCHEMA_VERSION = 1;

/** Lesson anatomy stages (CONTENT_FRAMEWORK §5.2), in their required order. `drill` is for quick packs. */
export const STAGES = [
  'warm_up',
  'input',
  'noticing',
  'controlled_practice',
  'free_production',
  'wrap_up',
  'drill',
] as const;
export type Stage = (typeof STAGES)[number];

const id = z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i, 'letters, digits, _ or - only');
const mediaId = z.uuid();
const spanishText = z.string().trim().min(1).max(2000);

const Prompt = z
  .object({
    text: spanishText.optional().describe('Spanish prompt text shown to the learner'),
    mediaId: mediaId.optional().describe('Picture, audio or video shown with the prompt'),
    tts: z.boolean().default(false).describe('Read the text aloud with text-to-speech'),
  })
  .refine((p) => p.text !== undefined || p.mediaId !== undefined, 'prompt needs text or media');

const ExerciseBase = {
  id,
  stage: z.enum(STAGES),
  objectiveIds: z.array(OBJECTIVE_ID).min(1).describe('Curriculum objectives this exercise practises'),
  prompt: Prompt,
  hint: z.string().max(500).optional().describe('English gloss or hint, hidden behind a tap in immersive mode'),
  estSeconds: z.number().int().positive().max(1800).optional(),
};

const Options = z.array(z.string().trim().min(1).max(200)).min(2).max(6);

export const Exercise = z.discriminatedUnion('type', [
  z.object({
    ...ExerciseBase,
    type: z.literal('flashcard'),
    direction: z.enum(['es_en', 'en_es', 'image_es']),
    back: z.string().trim().min(1).max(200),
  }),
  z.object({ ...ExerciseBase, type: z.literal('multiple_choice'), options: Options, correct: z.number().int().min(0) }),
  z.object({
    ...ExerciseBase,
    type: z.literal('listen_choose'),
    audioText: spanishText.describe('Spanish spoken to the learner via TTS or recorded audio'),
    options: Options,
    correct: z.number().int().min(0),
  }),
  z.object({
    ...ExerciseBase,
    type: z.literal('word_order'),
    tokens: z.array(z.string().trim().min(1)).min(2).max(15).describe('Words in the correct order'),
  }),
  z.object({
    ...ExerciseBase,
    type: z.literal('type_answer'),
    accepted: z.array(z.string().trim().min(1).max(200)).min(1).describe('Every acceptable answer'),
  }),
  z.object({ ...ExerciseBase, type: z.literal('listen_repeat'), text: spanishText }),
  z.object({
    ...ExerciseBase,
    type: z.literal('describe_image'),
    rubric: z.string().max(1000).optional().describe('What a good answer mentions, for AI/tutor assessment'),
  }),
  z.object({ ...ExerciseBase, type: z.literal('video_response'), maxSeconds: z.number().int().min(5).max(180) }),
  z.object({
    ...ExerciseBase,
    type: z.literal('conversation'),
    scenario: z.string().min(1).max(1000),
    partnerRole: z.string().min(1).max(200),
    maxTurns: z.number().int().min(2).max(20),
  }),
]);
export type Exercise = z.infer<typeof Exercise>;

export const VocabularyItem = z.object({
  lemma: z.string().trim().min(1).max(100),
  gloss: z.string().trim().min(1).max(200).describe('English meaning'),
  isNew: z.boolean().describe('Introduced by this lesson (vs recycled)'),
  forms: z.array(z.string().trim().min(1)).optional().describe('Inflected forms used in this lesson'),
  mediaId: mediaId.optional(),
});
export type VocabularyItem = z.infer<typeof VocabularyItem>;

export const LessonContent = z
  .object({
    schemaVersion: z.literal(LESSON_SCHEMA_VERSION),
    mode: z.enum(['immersive', 'quick_pack']),
    variety: z.enum(VARIETIES),
    cefr: z.enum(CEFR_LEVELS),
    title: z.string().trim().min(1).max(120),
    objectiveIds: z.array(OBJECTIVE_ID).min(1),
    estMinutes: z.number().int().min(1).max(60),
    vocabulary: z.array(VocabularyItem).max(60),
    exercises: z.array(Exercise).min(1).max(60),
  })
  .superRefine((lesson, ctx) => {
    const seen = new Set<string>();
    lesson.exercises.forEach((ex, i) => {
      if (seen.has(ex.id)) ctx.addIssue({ code: 'custom', path: ['exercises', i, 'id'], message: `duplicate exercise id ${ex.id}` });
      seen.add(ex.id);
    });
  });
export type LessonContent = z.infer<typeof LessonContent>;

/**
 * Provider-neutral JSON Schema of LessonContent (ADR 0008): handed to any LLM as the structured-output
 * schema and served by the MCP `schema://lesson-content` resource. Cross-field rules are enforced by checkLesson.
 */
export function lessonJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(LessonContent, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}
