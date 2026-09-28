import { describe, expect, it } from 'vitest';
import { assessFeasibility } from '../src';

const today = new Date('2026-10-01T00:00:00Z');
const weeksFrom = (w: number) => new Date(today.getTime() + w * 7 * 86_400_000);

describe('assessFeasibility', () => {
  it('is on track with enough time', () => {
    const r = assessFeasibility({ remainingObjectiveHours: [10, 10], weeklyHours: 5, today, deadline: weeksFrom(10) });
    expect(r).toMatchObject({ status: 'on_track', hoursNeeded: 20, hoursAvailable: 50, ratio: 2.5 });
    expect(r.projectedCompletion?.toISOString()).toBe(weeksFrom(4).toISOString());
  });

  it('is tight or not feasible as time shrinks', () => {
    expect(assessFeasibility({ remainingObjectiveHours: [20], weeklyHours: 5, today, deadline: weeksFrom(4) }).status).toBe('tight');
    expect(assessFeasibility({ remainingObjectiveHours: [20], weeklyHours: 5, today, deadline: weeksFrom(3) }).status).toBe(
      'not_feasible',
    );
  });

  it('applies the learner pace factor', () => {
    const base = { remainingObjectiveHours: [20], weeklyHours: 5, today, deadline: weeksFrom(4) };
    expect(assessFeasibility(base).status).toBe('tight'); // 20 h available / 20 h needed
    const slower = assessFeasibility({ ...base, paceFactor: 1.5 });
    expect(slower.hoursNeeded).toBe(30);
    expect(slower.status).toBe('not_feasible'); // 20 / 30
  });

  it('handles no deadline and zero study time', () => {
    expect(assessFeasibility({ remainingObjectiveHours: [5], weeklyHours: 0, today })).toMatchObject({
      status: 'no_deadline',
      projectedCompletion: null,
    });
  });
});
