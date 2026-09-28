import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, LearningEvent, TUTOR_EVENT_TYPES } from '../src';
import { answered, ctx, envelope } from './event-fixtures';

describe('LearningEvent', () => {
  it('accepts a well-formed answer event and applies defaults', () => {
    const parsed = LearningEvent.parse(answered({ result: 'wrong', score: 0 }));
    expect(parsed.type).toBe('exercise_answered');
    if (parsed.type !== 'exercise_answered') throw new Error('narrowing');
    expect(parsed.payload.tryNumber).toBe(1);
    expect(parsed.payload.errorTags).toEqual([]);
  });

  it('rejects unknown types, bad payloads and bad envelopes', () => {
    expect(LearningEvent.safeParse({ ...envelope(), type: 'nope', payload: {} }).success).toBe(false);
    expect(LearningEvent.safeParse({ ...envelope(), type: 'self_rated', payload: { ctx: ctx(), rating: 'meh' } }).success).toBe(false);
    expect(LearningEvent.safeParse({ ...envelope(), occurredAt: 'yesterday', type: 'screen_viewed', payload: { route: '/' } }).success).toBe(false);
    expect(
      LearningEvent.safeParse({ ...envelope(), type: 'exercise_answered', payload: { ...answered({}).payload, errorTags: ['err.unknown'] } }).success,
    ).toBe(false);
  });

  it('parses every event type from a minimal example', () => {
    const c = ctx();
    const examples: Record<string, unknown> = {
      session_started: { mode: 'quick', plannedSeconds: 180 },
      session_paused: { reason: 'backgrounded' },
      session_resumed: { pausedSeconds: 12 },
      session_ended: { outcome: 'completed', activeSeconds: 170 },
      exercise_presented: { ctx: c },
      exercise_answered: answered({}).payload,
      exercise_skipped: { ctx: c, secondsSpent: 4 },
      hint_revealed: { ctx: c, secondsAfterPresented: 9 },
      audio_replayed: { ctx: c, replayCount: 2, slowed: true },
      gloss_looked_up: { lemma: 'madrugar', surface: 'madrugo' },
      recording_submitted: { ctx: c, mediaId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab', durationMs: 8000 },
      self_rated: { ctx: c, rating: 'good' },
      assessment_recorded: { ctx: c, answerEventId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab', source: 'ai', score: 0.7 },
      session_rated: { difficulty: 'about_right', enjoyed: true },
      content_reported: { ctx: c, reason: 'audio_problem' },
      practice_logged: { activity: 'conversation', minutes: 45 },
      tutor_observation: { objectiveIds: ['gr.ser_estar'], level: 'struggling', origin: 'confirmed_suggestion' },
      tutored_session_logged: {
        minutes: 60,
        format: 'in_person',
        items: [{ objectiveId: 'gr.ser_estar', coverage: 'covered', level: 'progressing', suggested: true }],
        note: 'Practised ser/estar with photos of family.',
        secondsToLog: 25,
      },
      challenge_started: { challengeId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab', targetDate: '2027-03-01' },
      challenge_rehearsed: { challengeId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab', answerEventId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ac' },
      challenge_completed: { challengeId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab', where: 'real_world', confidence: 4, reflection: 'Said hola to Marta!' },
      screen_viewed: { route: '/student' },
    };
    expect(Object.keys(examples).sort()).toEqual([...EVENT_TYPES].sort());
    for (const [type, payload] of Object.entries(examples)) {
      const r = LearningEvent.safeParse({ ...envelope(), type, payload });
      expect(r.success, `${type}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
  });

  it('matches the event types and tutor rules enforced by the database', () => {
    // The latest definition wins: migrations are applied in file-name order.
    const dir = new URL('../../../supabase/migrations/', import.meta.url);
    const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
    const check = [...sql.matchAll(/check \(type in \(([\s\S]*?)\)\)/g)].at(-1)?.[1] ?? '';
    const dbTypes = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(dbTypes.sort()).toEqual([...EVENT_TYPES].sort());
    for (const t of TUTOR_EVENT_TYPES) expect(sql).toContain(`'${t}'`);
  });
});
