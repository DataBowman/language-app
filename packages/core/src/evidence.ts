/**
 * First derived measures over the learning event ledger (docs/LEARNING_DATA.md §4).
 * Pure and re-runnable: change the rules here and recompute from the full history at any time.
 */
import type { ErrorTag } from './errors';
import type { EventType, ExerciseContext, LearningEvent } from './events';
import type { ExerciseType } from './exercise-types';

export interface LemmaEvidence {
  lemma: string;
  /** Times shown in an exercise (whether or not tested). */
  exposures: number;
  /** Scored answers that tested this word. */
  attempts: number;
  /** Sum of scores (0–1 each); accuracy = scoreSum / attempts. */
  scoreSum: number;
  accuracy: number | null;
  /** Correct apart from a missing/wrong accent: known word, spelling still to practise. */
  accentSlips: number;
  /** Times the learner tapped the word to see its meaning. */
  lookups: number;
  lastSeenAt: string | null;
  lastCorrectAt: string | null;
  /** Median time to a correct answer: falls as the word becomes automatic. */
  medianCorrectLatencyMs: number | null;
}

export interface ObjectiveEvidence {
  objectiveId: string;
  attempts: number;
  scoreSum: number;
  accuracy: number | null;
  /** Distinct local calendar days with a scored attempt (mastery needs evidence on separate days). */
  practiceDays: number;
  /** A spoken, recorded or typed production scored ≥ 0.6. */
  hasProduction: boolean;
  /** Latest live-lesson judgement from the tutor, if any. */
  tutorLevel: 'struggling' | 'progressing' | 'secure' | null;
}

export interface EvidenceSummary {
  lemmas: Map<string, LemmaEvidence>;
  objectives: Map<string, ObjectiveEvidence>;
  errors: Map<ErrorTag, number>;
  sessions: { started: number; completed: number; abandoned: number; activeSeconds: number };
  outsidePracticeMinutes: number;
}

const PRODUCTION_TYPES = new Set<ExerciseType>(['type_answer', 'describe_image', 'video_response', 'conversation']);
const SELF_RATING_SCORE = { again: 0, hard: 0.7, good: 1, easy: 1 } as const;

/** Local calendar day of an event; tzOffsetMin is minutes east of UTC (−Date#getTimezoneOffset()). */
function localDay(e: LearningEvent): string {
  return new Date(Date.parse(e.occurredAt) + e.tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const byTime = (a: LearningEvent, b: LearningEvent) =>
  Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq;

type Of<T extends EventType> = Extract<LearningEvent, { type: T }>;

interface Scored {
  ctx: ExerciseContext;
  score: number;
  at: string;
  day: string;
  latencyMs?: number;
  accentSlip: boolean;
  lemmaScores?: Record<string, number>;
  objectiveScores?: Record<string, number>;
}

export function summarizeEvidence(events: readonly LearningEvent[]): EvidenceSummary {
  const sorted = [...events].sort(byTime);
  const lemmas = new Map<string, LemmaEvidence & { latencies: number[] }>();
  const objectives = new Map<string, ObjectiveEvidence & { days: Set<string> }>();
  const errors = new Map<ErrorTag, number>();
  const sessions = { started: 0, completed: 0, abandoned: 0, activeSeconds: 0 };
  let outsidePracticeMinutes = 0;

  const lemmaOf = (l: string) => {
    let e = lemmas.get(l);
    if (!e) {
      e = { lemma: l, exposures: 0, attempts: 0, scoreSum: 0, accuracy: null, accentSlips: 0, lookups: 0, lastSeenAt: null, lastCorrectAt: null, medianCorrectLatencyMs: null, latencies: [] };
      lemmas.set(l, e);
    }
    return e;
  };
  const objectiveOf = (id: string) => {
    let e = objectives.get(id);
    if (!e) {
      e = { objectiveId: id, attempts: 0, scoreSum: 0, accuracy: null, practiceDays: 0, hasProduction: false, tutorLevel: null, days: new Set() };
      objectives.set(id, e);
    }
    return e;
  };
  const countErrors = (tags: readonly ErrorTag[]) => tags.forEach((t) => errors.set(t, (errors.get(t) ?? 0) + 1));

  // An answer's score comes from the answer itself, or — for spoken/video answers — from its assessment.
  // A tutor assessment overrides an AI one for the same answer.
  const assessments = new Map<string, Of<'assessment_recorded'>>();
  for (const e of sorted) {
    if (e.type !== 'assessment_recorded') continue;
    const prev = assessments.get(e.payload.answerEventId);
    if (!prev || e.payload.source === 'tutor' || prev.payload.source === 'ai') assessments.set(e.payload.answerEventId, e);
  }

  const scored: Scored[] = [];
  for (const e of sorted) {
    switch (e.type) {
      case 'session_started':
        sessions.started++;
        break;
      case 'session_ended':
        if (e.payload.outcome === 'completed') sessions.completed++;
        if (e.payload.outcome === 'abandoned') sessions.abandoned++;
        sessions.activeSeconds += e.payload.activeSeconds;
        break;
      case 'practice_logged':
        outsidePracticeMinutes += e.payload.minutes;
        break;
      case 'exercise_presented':
        for (const l of e.payload.ctx.lemmas) {
          const le = lemmaOf(l);
          le.exposures++;
          le.lastSeenAt = e.occurredAt;
        }
        break;
      case 'gloss_looked_up':
        lemmaOf(e.payload.lemma).lookups++;
        break;
      case 'tutor_observation':
        for (const o of e.payload.objectiveIds) objectiveOf(o).tutorLevel = e.payload.level;
        break;
      case 'self_rated':
        scored.push({ ctx: e.payload.ctx, score: SELF_RATING_SCORE[e.payload.rating], at: e.occurredAt, day: localDay(e), accentSlip: false });
        break;
      case 'exercise_answered': {
        const p = e.payload;
        const assessment = assessments.get(e.id);
        if (p.result === 'pending' && !assessment) break; // not scored yet
        const a = assessment?.payload;
        countErrors(a ? a.errorTags : p.errorTags);
        scored.push({
          ctx: p.ctx,
          score: a?.score ?? p.score ?? (p.result === 'correct' ? 1 : p.result === 'partial' ? 0.5 : 0),
          at: e.occurredAt,
          day: localDay(e),
          latencyMs: p.latencyMs.submit,
          accentSlip: p.answerClass === 'accent_only',
          lemmaScores: a?.lemmaScores,
          objectiveScores: a?.objectiveScores,
        });
        break;
      }
    }
  }

  for (const s of scored) {
    for (const l of s.ctx.lemmas) {
      const score = s.lemmaScores?.[l] ?? s.score;
      const le = lemmaOf(l);
      le.attempts++;
      le.scoreSum += score;
      le.lastSeenAt = s.at;
      if (s.accentSlip) le.accentSlips++;
      if (score >= 0.8) {
        le.lastCorrectAt = s.at;
        if (s.latencyMs !== undefined) le.latencies.push(s.latencyMs);
      }
    }
    for (const o of s.ctx.objectiveIds) {
      const score = s.objectiveScores?.[o] ?? s.score;
      const oe = objectiveOf(o);
      oe.attempts++;
      oe.scoreSum += score;
      oe.days.add(s.day);
      if (PRODUCTION_TYPES.has(s.ctx.exerciseType) && score >= 0.6) oe.hasProduction = true;
    }
  }

  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    lemmas: new Map(
      [...lemmas].map(([k, { latencies, ...e }]) => [
        k,
        { ...e, scoreSum: round(e.scoreSum), accuracy: e.attempts ? round(e.scoreSum / e.attempts) : null, medianCorrectLatencyMs: median(latencies) },
      ]),
    ),
    objectives: new Map(
      [...objectives].map(([k, { days, ...e }]) => [
        k,
        { ...e, scoreSum: round(e.scoreSum), accuracy: e.attempts ? round(e.scoreSum / e.attempts) : null, practiceDays: days.size },
      ]),
    ),
    errors,
    sessions,
    outsidePracticeMinutes,
  };
}
