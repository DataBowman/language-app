import { describe, expect, it } from 'vitest';
import {
  Challenge,
  CHALLENGE_TEMPLATES,
  challengeObjectiveIds,
  effectiveContext,
  estimateLevels,
  Goal,
  isMastered,
  LearnerSettings,
  loadCurriculum,
  validateGraph,
  type ObjectiveEvidence,
} from '../src';

const ev = (objectiveId: string, over: Partial<ObjectiveEvidence> = {}): [string, ObjectiveEvidence] => [
  objectiveId,
  { objectiveId, attempts: 6, scoreSum: 5.4, accuracy: 0.9, practiceDays: 3, hasProduction: true, tutorLevel: null, ...over },
];

describe('bundled Spanish curriculum', () => {
  const objectives = loadCurriculum('es');

  it('is a valid graph without level inversions', () => {
    expect(validateGraph(objectives)).toEqual([]);
  });

  it('contains every objective the challenge templates need', () => {
    const ids = new Set(objectives.map((o) => o.id));
    for (const t of Object.values(CHALLENGE_TEMPLATES))
      for (const id of challengeObjectiveIds(Challenge.parse(t))) expect(ids.has(id), id).toBe(true);
  });
});

describe('learner settings: unknown is a normal state', () => {
  it('defaults everything to unknown, with automatic plan changes', () => {
    expect(LearnerSettings.parse({})).toEqual({
      targetLanguage: 'es',
      variety: null,
      weeklyMinutes: null,
      quickShare: null,
      planAutonomy: 'auto',
      uiLanguage: 'en',
    });
  });

  it('fills unknowns with shared defaults and says which were assumed', () => {
    expect(effectiveContext(LearnerSettings.parse({}))).toEqual({
      targetLanguage: 'es',
      variety: 'es',
      weeklyMinutes: 60,
      quickShare: 0.4,
      assumed: ['variety', 'weeklyMinutes', 'quickShare'],
    });
    const chosen = effectiveContext(LearnerSettings.parse({ variety: 'es-MX', weeklyMinutes: 120 }));
    expect(chosen).toMatchObject({ variety: 'es-MX', weeklyMinutes: 120, assumed: ['quickShare'] });
  });
});

describe('goals are selectable', () => {
  it('accepts challenge, level and custom goals with an optional date', () => {
    expect(Goal.parse({ kind: 'challenge', challengeId: '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab', targetDate: '2027-03-01' }).status).toBe('active');
    expect(Goal.safeParse({ kind: 'level', targetLevel: 'B1' }).success).toBe(true);
    expect(Goal.safeParse({ kind: 'custom', description: 'Watch a film without subtitles' }).success).toBe(true);
  });
  it('rejects incomplete goals', () => {
    expect(Goal.safeParse({ kind: 'challenge' }).success).toBe(false);
    expect(Goal.safeParse({ kind: 'level' }).success).toBe(false);
  });
});

describe('estimateLevels: derived, adapts continuously', () => {
  const objectives = loadCurriculum('es');

  it('has no level and zero confidence without evidence', () => {
    const levels = estimateLevels(objectives, new Map());
    expect(levels.speaking).toMatchObject({ level: null, working: 'A1', confidence: 0, masteredAtWorking: 0 });
  });

  it('reaches A1 when most A1 objectives for a skill are mastered, and moves on to A2', () => {
    const a1Speaking = objectives.filter((o) => o.cefr === 'A1' && o.skills.includes('speaking'));
    const evidence = new Map(a1Speaking.map((o) => ev(o.id)));
    const levels = estimateLevels(objectives, evidence);
    expect(levels.speaking).toMatchObject({ level: 'A1', working: 'A2', confidence: 0 });
  });

  it('respects each objective\'s own mastery criteria and the tutor\'s judgement', () => {
    const o = objectives.find((x) => x.id === 'cd.order_food')!;
    expect(o.mastery.requiresProduction).toBe(true);
    expect(isMastered(o, ev(o.id, { hasProduction: false })[1])).toBe(false);
    expect(isMastered(o, ev(o.id, { practiceDays: 2 })[1])).toBe(false);
    expect(isMastered(o, ev(o.id, { accuracy: 0.1, tutorLevel: 'secure' })[1])).toBe(true);
    expect(isMastered(o, ev(o.id)[1])).toBe(true);
  });
});
