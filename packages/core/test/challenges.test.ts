import { describe, expect, it } from 'vitest';
import { Challenge, CHALLENGE_TEMPLATES, challengeObjectiveIds, challengeReadiness, objectiveReadiness, type ObjectiveEvidence } from '../src';

const ev = (objectiveId: string, over: Partial<ObjectiveEvidence> = {}): [string, ObjectiveEvidence] => [
  objectiveId,
  { objectiveId, attempts: 6, scoreSum: 5.4, accuracy: 0.9, practiceDays: 3, hasProduction: true, tutorLevel: null, ...over },
];

describe('challenge templates', () => {
  it('are valid challenges with valid objective ids', () => {
    for (const t of Object.values(CHALLENGE_TEMPLATES)) {
      const c = Challenge.parse(t);
      expect(challengeObjectiveIds(c).length).toBeGreaterThan(0);
    }
  });
});

describe('objectiveReadiness', () => {
  it('is zero without evidence and discounts few practice days and missing production', () => {
    expect(objectiveReadiness(undefined)).toBe(0);
    expect(objectiveReadiness(ev('fn.greetings', { practiceDays: 1 })[1])).toBe(0.3);
    expect(objectiveReadiness(ev('fn.greetings', { hasProduction: false })[1])).toBe(0.7);
  });

  it('lets the tutor\'s live judgement override app evidence', () => {
    expect(objectiveReadiness(ev('fn.greetings', { accuracy: 0.2, tutorLevel: 'secure' })[1])).toBe(0.9);
    expect(objectiveReadiness(ev('fn.greetings', { tutorLevel: 'struggling' })[1])).toBe(0.4);
  });
});

describe('challengeReadiness', () => {
  const c = Challenge.parse(CHALLENGE_TEMPLATES.greet_colleague);

  it('reports status, per-step readiness, gaps and the next step', () => {
    const r = challengeReadiness(c, new Map([ev('fn.greetings'), ev('cd.introduce_self'), ev('fn.farewells')]));
    expect(r.steps.map((s) => [s.id, s.readiness])).toEqual([
      ['greet', 0.9],
      ['small_talk', 0],
      ['goodbye', 0.9],
    ]);
    expect(r.readiness).toBe(0.6);
    expect(r.status).toBe('getting_there');
    expect(r.nextStepId).toBe('small_talk');
    expect(r.gaps.map((g) => g.objectiveId).sort()).toEqual(['cd.small_talk_basic', 'fn.register_tu_usted']);
  });

  it('is ready when every step is', () => {
    const all = new Map(challengeObjectiveIds(c).map((id) => ev(id)));
    expect(challengeReadiness(c, all)).toMatchObject({ status: 'ready', nextStepId: null, gaps: [] });
  });
});
