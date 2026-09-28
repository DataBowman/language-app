import { describe, expect, it } from 'vitest';
import { Objective, prerequisiteOrder, validateGraph } from '../src';
import { objective } from './fixtures';

describe('Objective schema', () => {
  it('requires the id prefix to match the type', () => {
    expect(Objective.safeParse(objective('gr.ser_estar')).success).toBe(true);
    expect(Objective.safeParse({ ...objective('gr.ser_estar'), type: 'vocab_set' }).success).toBe(false);
    expect(Objective.safeParse(objective('Grammar.X')).success).toBe(false);
  });
});

describe('validateGraph', () => {
  it('accepts a clean graph', () => {
    const g = [objective('vo.food.basic'), objective('cd.order_food', { prerequisites: ['vo.food.basic'] })];
    expect(validateGraph(g)).toEqual([]);
  });

  it('reports duplicates, unknown prerequisites, cycles and level inversions', () => {
    const g = [
      objective('gr.a', { prerequisites: ['gr.b'] }),
      objective('gr.b', { prerequisites: ['gr.a'] }),
      objective('gr.c', { prerequisites: ['gr.missing'] }),
      objective('gr.c'),
      objective('gr.hard', { cefr: 'B1' }),
      objective('cd.easy', { prerequisites: ['gr.hard'] }),
    ];
    const messages = validateGraph(g).map((i) => `${i.severity}:${i.message}`);
    expect(messages).toContain('error:duplicate id');
    expect(messages).toContain('error:unknown prerequisite gr.missing');
    expect(messages.some((m) => m.startsWith('error:prerequisite cycle'))).toBe(true);
    expect(messages).toContain('warning:prerequisite gr.hard is at a higher level (B1 > A1)');
  });
});

describe('prerequisiteOrder', () => {
  it('puts prerequisites first and lower levels earlier', () => {
    const g = [
      objective('cd.order_food', { prerequisites: ['vo.food.basic', 'fn.polite_requests'] }),
      objective('gr.preterite', { cefr: 'A2' }),
      objective('fn.polite_requests'),
      objective('vo.food.basic'),
    ];
    const ids = prerequisiteOrder(g).map((o) => o.id);
    expect(ids.indexOf('cd.order_food')).toBeGreaterThan(ids.indexOf('vo.food.basic'));
    expect(ids.indexOf('cd.order_food')).toBeGreaterThan(ids.indexOf('fn.polite_requests'));
    expect(ids.at(-1)).toBe('gr.preterite');
  });

  it('throws on a cycle', () => {
    expect(() =>
      prerequisiteOrder([objective('gr.a', { prerequisites: ['gr.b'] }), objective('gr.b', { prerequisites: ['gr.a'] })]),
    ).toThrow(/cycle/);
  });
});
