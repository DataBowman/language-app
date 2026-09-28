/**
 * Deterministic classification of typed answers. Separates "doesn't know it" from "forgot the accent"
 * or "one-letter typo", so word knowledge and spelling are tracked separately (docs/LEARNING_DATA.md).
 */
import type { ErrorTag } from './errors';
import { normalizeAnswer, tokenize } from './text';

export type AnswerClass = 'correct' | 'accent_only' | 'minor_typo' | 'wrong';

export interface AnswerVerdict {
  answerClass: AnswerClass;
  /** The accepted answer it was matched against, if any. */
  matched: string | null;
  /** correct and accent_only count as knowing the item; minor_typo as partial. */
  score: number;
  errorTags: ErrorTag[];
}

/** Exact comparison that keeps accents and ñ but ignores case, punctuation and spacing. */
const strict = (s: string) => tokenize(s).join(' ');

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * One wrong letter in one word of ≥ 5 letters, away from the word's ending. Spanish marks person,
 * number, gender and tense in the last letters (levanto/levanta, rojo/roja), so a difference there
 * is treated as a real error, never as a typo.
 */
function isMinorTypo(given: string, target: string): boolean {
  const g = given.split(' ');
  const t = target.split(' ');
  if (g.length !== t.length) return false;
  const diff = g.flatMap((w, i) => (w === t[i] ? [] : [[w, t[i]!] as const]));
  if (diff.length !== 1) return false;
  const [gw, tw] = diff[0]!;
  return tw.length >= 5 && editDistance(gw, tw) === 1 && gw.slice(-2) === tw.slice(-2);
}

export function classifyTypedAnswer(given: string, accepted: readonly string[]): AnswerVerdict {
  const g = strict(given);
  if (g.length > 0) {
    for (const a of accepted) if (strict(a) === g) return { answerClass: 'correct', matched: a, score: 1, errorTags: [] };
    const loose = normalizeAnswer(given);
    for (const a of accepted)
      if (normalizeAnswer(a) === loose) return { answerClass: 'accent_only', matched: a, score: 1, errorTags: ['err.accent'] };
    for (const a of accepted)
      if (isMinorTypo(loose, normalizeAnswer(a)))
        return { answerClass: 'minor_typo', matched: a, score: 0.5, errorTags: ['err.spelling'] };
  }
  return { answerClass: 'wrong', matched: null, score: 0, errorTags: [] };
}
