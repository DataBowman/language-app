/**
 * Suggested plan for a live tutored session (ADR 0011), built from the evidence so the tutor can
 * prepare in seconds and log the session afterwards by confirming instead of typing.
 * Deterministic and explainable: every item says *why* it is suggested. An AI can refine the list later
 * through the MCP server; this works without one.
 */
import { challengeReadiness, type Challenge } from './challenges';
import { ERROR_TAGS, type ErrorTag } from './errors';
import type { EvidenceSummary } from './evidence';

export interface SuggestedItem {
  kind: 'objective' | 'lemma' | 'error' | 'challenge_step';
  /** objective id, lemma, error tag, or `${challengeId}:${stepId}`. */
  ref: string;
  reason: string;
  /** Higher = more important; items are returned in this order. */
  priority: number;
}

export interface ActiveChallenge {
  id: string;
  challenge: Pick<Challenge, 'title' | 'steps'>;
}

export const SUGGESTION_PARAMS = {
  maxItems: 6,
  weakAccuracy: 0.6,
  minAttempts: 2,
  recurringErrorCount: 3,
  lookupsForUnknownWord: 3,
};

export function suggestTutoredSession(
  summary: EvidenceSummary,
  activeChallenges: readonly ActiveChallenge[] = [],
  p = SUGGESTION_PARAMS,
): SuggestedItem[] {
  const items: SuggestedItem[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // 1. The next unready step of each active challenge: the learner's own real-world goal comes first.
  for (const { id, challenge } of activeChallenges) {
    const r = challengeReadiness(challenge, summary.objectives);
    const step = challenge.steps.find((s) => s.id === r.nextStepId);
    if (step)
      items.push({
        kind: 'challenge_step',
        ref: `${id}:${step.id}`,
        reason: `Next step of "${challenge.title}" (${pct(r.readiness)} ready): ${step.title}`,
        priority: 100 - r.readiness * 10,
      });
  }

  for (const o of summary.objectives.values()) {
    // 2. The tutor saw a struggle last time.
    if (o.tutorLevel === 'struggling') {
      items.push({ kind: 'objective', ref: o.objectiveId, reason: 'You marked this as a struggle last time', priority: 90 });
    } else if (o.accuracy !== null && o.attempts >= p.minAttempts && o.accuracy < p.weakAccuracy) {
      // 3. Weak in the app.
      items.push({
        kind: 'objective',
        ref: o.objectiveId,
        reason: `${pct(o.accuracy)} accuracy over ${o.attempts} attempts in the app`,
        priority: 80 - o.accuracy * 20,
      });
    } else if (!o.hasProduction && o.accuracy !== null && o.accuracy >= 0.8 && o.attempts >= p.minAttempts) {
      // 4. Known passively but never produced: live conversation is the best place to practise speaking it.
      items.push({ kind: 'objective', ref: o.objectiveId, reason: 'Recognised well in the app but not yet used when speaking', priority: 60 });
    }
  }

  // 5. Recurring misconceptions.
  for (const [tag, count] of summary.errors)
    if (count >= p.recurringErrorCount)
      items.push({ kind: 'error', ref: tag, reason: `${ERROR_TAGS[tag as ErrorTag]} — ${count} times`, priority: 70 + Math.min(count, 10) });

  // 6. Words looked up repeatedly and still not known.
  for (const w of summary.lemmas.values())
    if (w.lookups >= p.lookupsForUnknownWord && (w.accuracy ?? 0) < p.weakAccuracy)
      items.push({ kind: 'lemma', ref: w.lemma, reason: `Looked up ${w.lookups} times and not yet recalled reliably`, priority: 50 + w.lookups });

  const seen = new Set<string>();
  return items
    .sort((a, b) => b.priority - a.priority)
    .filter((i) => !seen.has(`${i.kind}:${i.ref}`) && seen.add(`${i.kind}:${i.ref}`))
    .slice(0, p.maxItems)
    .map((i) => ({ ...i, priority: Math.round(i.priority) }));
}

/**
 * Pre-fills the `items` of a `tutored_session_logged` event from a suggestion, so logging is mostly
 * one tap per exception. Suggested items start as `covered`; the tutor unticks what did not happen.
 */
export function sessionLogDraft(suggestion: readonly SuggestedItem[], defaultCoverage: 'covered' | 'not_covered' = 'covered') {
  return suggestion
    .filter((i) => i.kind !== 'error')
    .map((i) => {
      const base = { coverage: defaultCoverage, suggested: true } as const;
      if (i.kind === 'objective') return { ...base, objectiveId: i.ref };
      if (i.kind === 'lemma') return { ...base, lemma: i.ref };
      return { ...base, challengeId: i.ref.split(':')[0]! };
    });
}
