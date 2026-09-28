import { describe, expect, it } from 'vitest';
import { LearningEvent, summarizeEvidence } from '../src';
import { answered, ctx, envelope } from './event-fixtures';

const parse = (xs: unknown[]) => xs.map((x) => LearningEvent.parse(x));

describe('summarizeEvidence', () => {
  it('builds per-word evidence from exposures, answers and lookups', () => {
    const s = summarizeEvidence(
      parse([
        { ...envelope({ occurredAt: '2026-10-01T08:00:00Z' }), type: 'exercise_presented', payload: { ctx: ctx() } },
        { ...envelope(), type: 'gloss_looked_up', payload: { lemma: 'levantarse' } },
        answered({ result: 'wrong', score: 0, latencyMs: { submit: 9000 } }, { occurredAt: '2026-10-01T08:00:10Z' }),
        answered({ result: 'correct', score: 1, answerClass: 'accent_only', latencyMs: { submit: 6000 } }, { occurredAt: '2026-10-02T08:00:00Z' }),
        answered({ result: 'correct', score: 1, latencyMs: { submit: 3000 } }, { occurredAt: '2026-10-03T08:00:00Z' }),
      ]),
    );
    const w = s.lemmas.get('levantarse')!;
    expect(w).toMatchObject({ exposures: 1, attempts: 3, accuracy: 0.667, accentSlips: 1, lookups: 1, lastCorrectAt: '2026-10-03T08:00:00Z' });
    expect(w.medianCorrectLatencyMs).toBe(4500);

    const o = s.objectives.get('gr.reflexive_present')!;
    expect(o).toMatchObject({ attempts: 3, practiceDays: 3, hasProduction: true });
  });

  it('counts practice days in the learner\'s local time', () => {
    // 23:30 and 00:30 UTC are the same local day at UTC−2.
    const s = summarizeEvidence(
      parse([
        answered({}, { occurredAt: '2026-10-01T23:30:00Z', tzOffsetMin: -120 }),
        answered({}, { occurredAt: '2026-10-02T00:30:00Z', tzOffsetMin: -120 }),
      ]),
    );
    expect(s.objectives.get('gr.reflexive_present')!.practiceDays).toBe(1);
  });

  it('waits for assessments of spoken answers and prefers the tutor over AI', () => {
    const spoken = answered({ result: 'pending', score: null, response: { kind: 'media', mediaId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab' } }, {}, { exerciseType: 'describe_image' });
    const pendingOnly = summarizeEvidence(parse([spoken]));
    expect(pendingOnly.objectives.get('gr.reflexive_present')).toBeUndefined();

    const assess = (source: string, score: number, errorTags: string[] = []) => ({
      ...envelope(),
      type: 'assessment_recorded',
      payload: { ctx: ctx({ exerciseType: 'describe_image' }), answerEventId: spoken.id, source, score, errorTags },
    });
    const s = summarizeEvidence(parse([spoken, assess('tutor', 0.9), assess('ai', 0.2, ['err.ser_estar'])]));
    expect(s.objectives.get('gr.reflexive_present')).toMatchObject({ attempts: 1, accuracy: 0.9, hasProduction: true });
    expect(s.errors.get('err.ser_estar')).toBeUndefined();
  });

  it('counts misconceptions, sessions, outside practice and tutor observations', () => {
    const s = summarizeEvidence(
      parse([
        { ...envelope(), type: 'session_started', payload: { mode: 'quick', plannedSeconds: 180 } },
        answered({ result: 'wrong', score: 0, errorTags: ['err.verb_person'] }),
        answered({ result: 'wrong', score: 0, errorTags: ['err.verb_person'] }),
        { ...envelope(), type: 'session_ended', payload: { outcome: 'abandoned', activeSeconds: 95 } },
        { ...envelope(), type: 'practice_logged', payload: { activity: 'conversation', minutes: 40 } },
        { ...envelope(), type: 'tutor_observation', payload: { objectiveIds: ['gr.reflexive_present'], level: 'struggling' } },
      ]),
    );
    expect(s.errors.get('err.verb_person')).toBe(2);
    expect(s.sessions).toEqual({ started: 1, completed: 0, abandoned: 1, activeSeconds: 95 });
    expect(s.outsidePracticeMinutes).toBe(40);
    expect(s.objectives.get('gr.reflexive_present')!.tutorLevel).toBe('struggling');
  });

  it('treats a self-rating of "again" as a failed recall', () => {
    const s = summarizeEvidence(parse([{ ...envelope(), type: 'self_rated', payload: { ctx: ctx({ exerciseType: 'flashcard' }), rating: 'again' } }]));
    expect(s.lemmas.get('levantarse')).toMatchObject({ attempts: 1, accuracy: 0 });
  });
});
