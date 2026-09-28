import { describe, expect, it } from 'vitest';
import { buildStudentProgress, Challenge, CHALLENGE_TEMPLATES, LearningEvent, summarizeEvidence } from '../src';
import { answered, envelope } from './event-fixtures';

const parse = (xs: unknown[]) => xs.map((x) => LearningEvent.parse(x));
const sessionOn = (day: string, activeSeconds: number) => ({
  ...envelope({ occurredAt: `${day}T09:00:00Z` }),
  type: 'session_ended',
  payload: { outcome: 'completed', activeSeconds },
});

describe('buildStudentProgress', () => {
  // Thu 1 Oct 2026 … Mon 5 Oct … (week starts Monday)
  const summary = summarizeEvidence(
    parse([
      sessionOn('2026-10-01', 600),
      sessionOn('2026-10-03', 300),
      sessionOn('2026-10-04', 300),
      sessionOn('2026-10-05', 240),
      answered({}, { occurredAt: '2026-10-06T08:00:00Z' }),
      answered({}, { occurredAt: '2026-10-06T08:01:00Z' }),
      answered({}, { occurredAt: '2026-10-06T08:02:00Z' }),
      { ...envelope(), type: 'practice_logged', payload: { activity: 'tv_video', minutes: 30 } },
    ]),
  );

  it('counts the streak back from today, or from yesterday if today is not done yet', () => {
    expect(buildStudentProgress(summary, '2026-10-06')).toMatchObject({ streakDays: 4, practisedToday: true });
    expect(buildStudentProgress(summary, '2026-10-07')).toMatchObject({ streakDays: 4, practisedToday: false });
    expect(buildStudentProgress(summary, '2026-10-08').streakDays).toBe(0);
  });

  it('summarises this week and words without exposing raw analytics', () => {
    const p = buildStudentProgress(summary, '2026-10-06');
    expect(p).toMatchObject({ minutesThisWeek: 4, daysActiveThisWeek: 2, wordsPractised: 1, wordsStrong: 1, outsidePracticeMinutes: 30 });
    expect(Object.keys(p)).not.toContain('errors');
  });

  it('shows challenge readiness and the next step', () => {
    const p = buildStudentProgress(summary, '2026-10-06', [{ id: 'c1', challenge: Challenge.parse(CHALLENGE_TEMPLATES.greet_colleague) }]);
    expect(p.challenges[0]).toMatchObject({ id: 'c1', title: 'Greet a Spanish-speaking colleague', readinessPct: 0, status: 'not_ready', nextStep: 'Greet and introduce yourself' });
  });
});
