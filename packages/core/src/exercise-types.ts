/**
 * Exercise-type registry (docs/DATA_MODEL.md "Exercise types and modes", ADR 0007).
 * The lesson player, the SessionComposer and the lesson generator all read this metadata,
 * so the rules about which type suits which mode live in exactly one place.
 */
export const EXERCISE_TYPES = [
  'flashcard',
  'multiple_choice',
  'listen_choose',
  'word_order',
  'type_answer',
  'listen_repeat',
  'describe_image',
  'video_response',
  'conversation',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export type SessionMode = 'immersive' | 'quick';

export interface ExerciseTypeInfo {
  /** Plain-language description; also shown to AI models via the MCP schema resource. */
  description: string;
  modes: readonly SessionMode[];
  /** Can be scored on the device with no AI or tutor. Quick mode only uses these. */
  autoScored: boolean;
  /** Needs server AI (speech-to-text and/or LLM) to give feedback. */
  needsAi: boolean;
  /** Typical time on task, used when an exercise does not declare its own. */
  defaultSeconds: number;
}

export const EXERCISE_TYPE_INFO: Record<ExerciseType, ExerciseTypeInfo> = {
  flashcard: {
    description: 'Recall card (Spanish↔English or picture→Spanish); the learner self-grades again/hard/good/easy.',
    modes: ['quick'],
    autoScored: true,
    needsAi: false,
    defaultSeconds: 10,
  },
  multiple_choice: {
    description: 'Pick the one correct option.',
    modes: ['immersive', 'quick'],
    autoScored: true,
    needsAi: false,
    defaultSeconds: 20,
  },
  listen_choose: {
    description: 'Hear Spanish audio, then pick its meaning or the matching picture.',
    modes: ['immersive', 'quick'],
    autoScored: true,
    needsAi: false,
    defaultSeconds: 20,
  },
  word_order: {
    description: 'Put shuffled Spanish words in the correct order.',
    modes: ['immersive', 'quick'],
    autoScored: true,
    needsAi: false,
    defaultSeconds: 30,
  },
  type_answer: {
    description: 'Type a short Spanish answer; matched against a list of accepted answers.',
    modes: ['immersive', 'quick'],
    autoScored: true,
    needsAi: false,
    defaultSeconds: 30,
  },
  listen_repeat: {
    description: 'Hear a Spanish phrase and say it back; checked by transcript comparison.',
    modes: ['immersive'],
    autoScored: false,
    needsAi: true,
    defaultSeconds: 20,
  },
  describe_image: {
    description: 'Look at a picture and describe it aloud in Spanish.',
    modes: ['immersive'],
    autoScored: false,
    needsAi: true,
    defaultSeconds: 90,
  },
  video_response: {
    description: 'Record a short video answering a prompt in Spanish.',
    modes: ['immersive'],
    autoScored: false,
    needsAi: true,
    defaultSeconds: 120,
  },
  conversation: {
    description: 'Turn-based spoken role-play with an AI partner.',
    modes: ['immersive'],
    autoScored: false,
    needsAi: true,
    defaultSeconds: 300,
  },
};

export function typesForMode(mode: SessionMode): ExerciseType[] {
  return EXERCISE_TYPES.filter((t) => EXERCISE_TYPE_INFO[t].modes.includes(mode));
}
