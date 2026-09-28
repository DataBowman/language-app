/**
 * The learner's curated progress view (ADR 0010). The student sees encouragement and direction built
 * from their evidence, not raw analytics (no error counts, look-ups or response times); the tutor sees
 * everything. Computed on the server, because learners cannot read the raw event ledger.
 */
import { challengeReadiness, type Challenge } from './challenges';
import type { EvidenceSummary } from './evidence';

export interface StudentProgress {
  streakDays: number;
  practisedToday: boolean;
  minutesThisWeek: number;
  daysActiveThisWeek: number;
  wordsPractised: number;
  /** Recalled well (≥ 80%) at least three times. */
  wordsStrong: number;
  outsidePracticeMinutes: number;
  challenges: { id: string; title: string; readinessPct: number; status: 'not_ready' | 'getting_there' | 'ready'; nextStep: string | null }[];
}

const DAY_MS = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * @param today learner's local date, YYYY-MM-DD
 * @param weekStartsOn 1 = Monday
 */
export function buildStudentProgress(
  summary: EvidenceSummary,
  today: string,
  challenges: readonly { id: string; challenge: Pick<Challenge, 'title' | 'steps'> }[] = [],
  weekStartsOn: 0 | 1 = 1,
): StudentProgress {
  const days = summary.activityByDay;
  const practisedToday = days.has(today);
  // A streak survives until the end of today: it counts back from today, or from yesterday if today is not done yet.
  let streakDays = 0;
  for (let d = practisedToday ? today : shift(today, -1); days.has(d); d = shift(d, -1)) streakDays++;

  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = shift(today, -((dow - weekStartsOn + 7) % 7));
  let seconds = 0;
  let daysActiveThisWeek = 0;
  for (const [d, s] of days)
    if (d >= weekStart && d <= today) {
      seconds += s;
      daysActiveThisWeek++;
    }

  const lemmas = [...summary.lemmas.values()];
  return {
    streakDays,
    practisedToday,
    minutesThisWeek: Math.round(seconds / 60),
    daysActiveThisWeek,
    wordsPractised: lemmas.filter((w) => w.attempts > 0).length,
    wordsStrong: lemmas.filter((w) => w.attempts >= 3 && (w.accuracy ?? 0) >= 0.8).length,
    outsidePracticeMinutes: summary.outsidePracticeMinutes,
    challenges: challenges.map(({ id, challenge }) => {
      const r = challengeReadiness(challenge, summary.objectives);
      return {
        id,
        title: challenge.title,
        readinessPct: Math.round(r.readiness * 100),
        status: r.status,
        nextStep: challenge.steps.find((s) => s.id === r.nextStepId)?.title ?? null,
      };
    }),
  };
}
