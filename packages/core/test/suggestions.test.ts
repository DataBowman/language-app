import { describe, expect, it } from 'vitest';
import { Challenge, CHALLENGE_TEMPLATES, LearningEvent, sessionLogDraft, suggestTutoredSession, summarizeEvidence } from '../src';
import { answered, envelope } from './event-fixtures';

const parse = (xs: unknown[]) => xs.map((x) => LearningEvent.parse(x));
const wrong = (objective: string, errorTags: string[] = []) =>
  answered({ result: 'wrong', score: 0, errorTags }, {}, { objectiveIds: [objective], lemmas: [] });

describe('suggestTutoredSession', () => {
  const events = parse([
    wrong('gr.ser_estar', ['err.ser_estar']),
    wrong('gr.ser_estar', ['err.ser_estar']),
    wrong('gr.ser_estar', ['err.ser_estar']),
    answered({}, {}, { objectiveIds: ['vo.food_basic'], lemmas: [], exerciseType: 'multiple_choice' }),
    answered({}, {}, { objectiveIds: ['vo.food_basic'], lemmas: [], exerciseType: 'multiple_choice' }),
    ...[1, 2, 3].map(() => ({ ...envelope(), type: 'gloss_looked_up', payload: { lemma: 'madrugar' } })),
    { ...envelope(), type: 'tutor_observation', payload: { objectiveIds: ['fn.farewells'], level: 'struggling' } },
  ]);
  const summary = summarizeEvidence(events);
  const challenge = { id: 'c1', challenge: Challenge.parse(CHALLENGE_TEMPLATES.greet_colleague) };

  it('puts the active challenge first and explains every suggestion', () => {
    const s = suggestTutoredSession(summary, [challenge]);
    expect(s[0]).toMatchObject({ kind: 'challenge_step', ref: 'c1:greet' });
    expect(s.map((i) => `${i.kind}:${i.ref}`)).toEqual([
      'challenge_step:c1:greet',
      'objective:fn.farewells',
      'objective:gr.ser_estar',
      'error:err.ser_estar',
      'objective:vo.food_basic',
      'lemma:madrugar',
    ]);
    expect(s.find((i) => i.ref === 'gr.ser_estar')!.reason).toBe('0% accuracy over 3 attempts in the app');
    expect(s.find((i) => i.ref === 'vo.food_basic')!.reason).toMatch(/not yet used when speaking/);
    expect(s.find((i) => i.ref === 'madrugar')!.reason).toMatch(/Looked up 3 times/);
  });

  it('caps the list', () => {
    expect(suggestTutoredSession(summary, [challenge], { maxItems: 2, weakAccuracy: 0.6, minAttempts: 2, recurringErrorCount: 3, lookupsForUnknownWord: 3 })).toHaveLength(2);
  });

  it('turns a suggestion into a pre-filled session log (errors are discussed, not logged as items)', () => {
    const draft = sessionLogDraft(suggestTutoredSession(summary, [challenge]));
    expect(draft).toContainEqual({ coverage: 'covered', suggested: true, challengeId: 'c1' });
    expect(draft).toContainEqual({ coverage: 'covered', suggested: true, lemma: 'madrugar' });
    expect(draft.some((d) => 'objectiveId' in d && d.objectiveId === 'gr.ser_estar')).toBe(true);
    expect(draft).toHaveLength(5);
  });
});
