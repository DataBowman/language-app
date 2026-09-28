import type { LearningEvent } from '../src';

let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export const LEARNER = '00000000-0000-4000-8000-00000000000b';

export function ctx(over: Record<string, unknown> = {}) {
  return {
    lessonId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab',
    lessonVersion: 1,
    exerciseId: 'ex1',
    exerciseType: 'type_answer',
    mode: 'immersive',
    objectiveIds: ['gr.reflexive_present'],
    lemmas: ['levantarse'],
    ...over,
  };
}

export function envelope(over: Record<string, unknown> = {}) {
  return {
    id: id(),
    v: 1,
    learnerId: LEARNER,
    sessionId: null,
    occurredAt: '2026-10-01T08:00:00.000Z',
    seq: seq,
    deviceId: 'dev-1',
    platform: 'web',
    appVersion: '0.1.0',
    tzOffsetMin: 0,
    ...over,
  };
}

/** An exercise_answered event (unparsed input shape). */
export function answered(payload: Record<string, unknown>, env: Record<string, unknown> = {}, c: Record<string, unknown> = {}) {
  return {
    ...envelope(env),
    type: 'exercise_answered',
    payload: { ctx: ctx(c), response: { kind: 'text', value: 'me levanto' }, result: 'correct', score: 1, latencyMs: { submit: 4000 }, ...payload },
  };
}

export const ev = (e: unknown) => e as LearningEvent;
