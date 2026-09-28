import { describe, expect, it } from 'vitest';
import { checkLesson, type CheckId, type LessonReport } from '../src';
import { validLesson } from './fixtures';

const failed = (r: LessonReport) => r.results.filter((c) => !c.ok).map((c) => c.id);
const failuresOf = (r: LessonReport, id: CheckId) => r.results.find((c) => c.id === id)?.failures ?? [];

describe('checkLesson', () => {
  it('passes the reference lesson', () => {
    const r = checkLesson(validLesson());
    expect(failed(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('Q1: rejects malformed input and stops there', () => {
    const r = checkLesson({ schemaVersion: 1, mode: 'immersive' });
    expect(r.ok).toBe(false);
    expect(r.results.map((c) => c.id)).toEqual(['Q1']);
    expect(failuresOf(r, 'Q1').length).toBeGreaterThan(0);
  });

  it('Q1: rejects duplicate exercise ids', () => {
    const l = validLesson();
    l.exercises[1]!.id = 'warm1';
    expect(failuresOf(checkLesson(l), 'Q1').join()).toMatch(/duplicate exercise id/);
  });

  it('ANATOMY: requires input and free production, in order', () => {
    const l = validLesson();
    l.exercises = l.exercises.filter((e) => e.stage !== 'input');
    expect(failuresOf(checkLesson(l), 'ANATOMY').join()).toMatch(/"input"/);

    const reordered = validLesson();
    reordered.exercises.reverse();
    expect(failuresOf(checkLesson(reordered), 'ANATOMY').length).toBeGreaterThan(0);
  });

  it('ANATOMY: quick packs only allow quick-mode types in stage drill', () => {
    const l = validLesson();
    l.mode = 'quick_pack';
    const f = failuresOf(checkLesson(l), 'ANATOMY').join('\n');
    expect(f).toMatch(/stage "drill"/);
    expect(f).toMatch(/describe_image is not allowed in quick mode/);
  });

  it('Q2: flags exercises off-plan and planned objectives never practised', () => {
    const l = validLesson();
    l.objectiveIds.push('vo.food.basic');
    l.exercises[0]!.objectiveIds = ['fn.greetings'];
    const f = failuresOf(checkLesson(l), 'Q2').join('\n');
    expect(f).toMatch(/fn.greetings is not in the lesson/);
    expect(f).toMatch(/vo.food.basic is never practised/);
  });

  it('Q3: measures known-word coverage of input and requires glosses for new words', () => {
    const known = new Set(['me', 'a', 'las', 'siete', 'escucha', 'y', 'repite']);
    expect(failuresOf(checkLesson(validLesson(), { knownForms: known }), 'Q3')).toHaveLength(1); // 'despierto' is 1/9 unknown
    const l = validLesson();
    l.vocabulary = [];
    const f = failuresOf(checkLesson(l, { knownForms: known }), 'Q3').join('\n');
    expect(f).toMatch(/not in vocabulary: despierto/);
  });

  it('Q3: passes when coverage is high enough', () => {
    const known = new Set(['me', 'despierto', 'a', 'las', 'siete', 'escucha', 'y', 'repite']);
    expect(failuresOf(checkLesson(validLesson(), { knownForms: known }), 'Q3')).toEqual([]);
  });

  it('Q4: limits new lemmas and new grammar points', () => {
    const l = validLesson();
    l.vocabulary = Array.from({ length: 13 }, (_, i) => ({ lemma: `palabra${i}`, gloss: 'word', isNew: true }));
    l.objectiveIds.push('gr.ser_estar');
    l.exercises[2]!.objectiveIds.push('gr.ser_estar');
    const r = checkLesson(l, {
      objectiveTypes: new Map([
        ['gr.reflexive_present', 'grammar'],
        ['gr.ser_estar', 'grammar'],
      ]),
      masteredObjectiveIds: new Set(),
    });
    const f = failuresOf(r, 'Q4').join('\n');
    expect(f).toMatch(/13 new lemmas/);
    expect(f).toMatch(/2 new grammar points/);
  });

  it('Q5: requires a share of practice to recycle earlier objectives', () => {
    const ctx = { previouslySeenObjectiveIds: new Set(['cd.shopping']) };
    expect(failuresOf(checkLesson(validLesson(), ctx), 'Q5')).toHaveLength(1);
    const ok = { previouslySeenObjectiveIds: new Set(['cd.daily_routine']) };
    expect(failuresOf(checkLesson(validLesson(), ok), 'Q5')).toEqual([]);
  });

  it('Q6: catches out-of-range and ambiguous answer keys', () => {
    const l = validLesson();
    const mc = l.exercises[0]!;
    if (mc.type !== 'multiple_choice') throw new Error('fixture changed');
    mc.correct = 5;
    mc.options = ['Sí', 'si'];
    const f = failuresOf(checkLesson(l), 'Q6').join('\n');
    expect(f).toMatch(/out of range/);
    expect(f).toMatch(/not distinct/);
  });

  it('Q7: flags forms from another Spanish variety', () => {
    const l = validLesson();
    l.exercises[1]!.prompt.text = 'Vosotros os despertáis a las siete.';
    expect(failuresOf(checkLesson(l), 'Q7').join()).toMatch(/vosotros \(Spain only\).*es-MX/);
    l.variety = 'es-ES';
    expect(failuresOf(checkLesson(l), 'Q7')).toEqual([]);
  });

  it('Q10: compares exercise time with the declared length', () => {
    const l = validLesson();
    l.estMinutes = 30;
    expect(failuresOf(checkLesson(l), 'Q10').join()).toMatch(/estMinutes is 30/);
  });
});

describe('lessonJsonSchema', () => {
  it('exports a JSON Schema with field descriptions for AI providers', async () => {
    const { lessonJsonSchema } = await import('../src');
    const schema = lessonJsonSchema() as { type: string; properties: Record<string, unknown> };
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['mode', 'variety', 'objectiveIds', 'exercises']),
    );
    expect(JSON.stringify(schema)).toContain('Curriculum objectives this exercise practises');
  });
});

describe('misconception tags on options', () => {
  it('Q6: optionErrors must align with options and leave the correct option untagged', () => {
    const l = validLesson();
    const mc = l.exercises[0]!;
    if (mc.type !== 'multiple_choice') throw new Error('fixture changed');
    mc.optionErrors = [null, 'err.vocab_confusion'];
    expect(checkLesson(l).ok).toBe(true);
    mc.optionErrors = ['err.vocab_confusion', null];
    expect(checkLesson(l).results.find((c) => c.id === 'Q6')!.failures.join()).toMatch(/correct option/);
    mc.optionErrors = [null];
    expect(checkLesson(l).results.find((c) => c.id === 'Q6')!.failures.join()).toMatch(/1 entries for 2 options/);
  });
});
