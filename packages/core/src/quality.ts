/**
 * Deterministic lesson quality checks (docs/CONTENT_FRAMEWORK.md §5.3).
 * These run identically whichever AI model wrote the lesson, and back the MCP `check_lesson` tool.
 * Q8 (language review by a second model) and Q9 (media exists + licensed) need I/O and live elsewhere.
 */
import { EXERCISE_TYPE_INFO } from './exercise-types';
import { DEFAULT_PARAMS, type FrameworkParams, type Variety } from './framework';
import { LessonContent, STAGES, type Exercise } from './lesson';
import type { ObjectiveType } from './curriculum';
import { normalizeAnswer, tokenize } from './text';

export type CheckId = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7' | 'Q10' | 'ANATOMY';

export interface CheckResult {
  id: CheckId;
  name: string;
  ok: boolean;
  /** Specific, actionable failures — sent back to the generator verbatim. */
  failures: string[];
}

export interface LessonReport {
  ok: boolean;
  lesson: LessonContent | null;
  results: CheckResult[];
}

/** What the checker knows about the learner and curriculum. Everything is optional; missing data skips checks. */
export interface CheckContext {
  /** Word forms the learner already knows (lower-case). Enables Q3. */
  knownForms?: ReadonlySet<string>;
  /** Objective types by id. Enables the grammar part of Q4. */
  objectiveTypes?: ReadonlyMap<string, ObjectiveType>;
  /** Objectives already mastered. Enables the grammar part of Q4. */
  masteredObjectiveIds?: ReadonlySet<string>;
  /** Objectives already taught before (mastered or not). Enables Q5. */
  previouslySeenObjectiveIds?: ReadonlySet<string>;
  params?: FrameworkParams;
}

const PRACTICE_STAGES = new Set(['warm_up', 'noticing', 'controlled_practice', 'free_production', 'drill']);

export function checkLesson(input: unknown, ctx: CheckContext = {}): LessonReport {
  const params = ctx.params ?? DEFAULT_PARAMS;
  const parsed = LessonContent.safeParse(input);
  const q1: CheckResult = {
    id: 'Q1',
    name: 'Valid structure',
    ok: parsed.success,
    failures: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
  if (!parsed.success) return { ok: false, lesson: null, results: [q1] };

  const lesson = parsed.data;
  const results = [
    q1,
    checkAnatomy(lesson),
    checkObjectiveAlignment(lesson),
    checkCoverage(lesson, ctx, params),
    checkNewLoad(lesson, ctx, params),
    checkRecycling(lesson, ctx, params),
    checkAnswerKeys(lesson),
    checkVariety(lesson),
    checkTiming(lesson, params),
  ];
  return { ok: results.every((r) => r.ok), lesson, results };
}

const result = (id: CheckId, name: string, failures: string[]): CheckResult => ({ id, name, ok: failures.length === 0, failures });

function checkAnatomy(lesson: LessonContent): CheckResult {
  const failures: string[] = [];
  const stages = lesson.exercises.map((e) => e.stage);
  if (lesson.mode === 'quick_pack') {
    const bad = lesson.exercises.filter((e) => e.stage !== 'drill');
    if (bad.length) failures.push(`quick packs use stage "drill" only (found ${bad.map((e) => e.id).join(', ')})`);
    for (const e of lesson.exercises)
      if (!EXERCISE_TYPE_INFO[e.type].modes.includes('quick'))
        failures.push(`${e.id}: type ${e.type} is not allowed in quick mode`);
  } else {
    if (stages.includes('drill')) failures.push('immersive lessons must not use stage "drill"');
    for (const required of ['input', 'free_production'] as const)
      if (!stages.includes(required)) failures.push(`missing required stage "${required}"`);
    for (let i = 1; i < stages.length; i++)
      if (STAGES.indexOf(stages[i]!) < STAGES.indexOf(stages[i - 1]!))
        failures.push(`${lesson.exercises[i]!.id}: stage "${stages[i]}" comes after "${stages[i - 1]}"`);
  }
  return result('ANATOMY', 'Lesson anatomy', failures);
}

function checkObjectiveAlignment(lesson: LessonContent): CheckResult {
  const failures: string[] = [];
  const planned = new Set(lesson.objectiveIds);
  const practised = new Set<string>();
  for (const e of lesson.exercises)
    for (const o of e.objectiveIds) {
      if (!planned.has(o)) failures.push(`${e.id}: objective ${o} is not in the lesson's objectiveIds`);
      practised.add(o);
    }
  for (const o of planned) if (!practised.has(o)) failures.push(`objective ${o} is never practised`);
  return result('Q2', 'Aligned to objectives', failures);
}

function inputTexts(e: Exercise): string[] {
  const texts = e.prompt.text ? [e.prompt.text] : [];
  if (e.type === 'listen_choose') texts.push(e.audioText);
  if (e.type === 'listen_repeat') texts.push(e.text);
  return texts;
}

function checkCoverage(lesson: LessonContent, ctx: CheckContext, params: FrameworkParams): CheckResult {
  const name = 'Difficulty (known-word coverage)';
  if (!ctx.knownForms) return result('Q3', name, []);
  const glossed = new Set(lesson.vocabulary.flatMap((v) => [v.lemma, ...(v.forms ?? [])].flatMap(tokenize)));
  const tokens = lesson.exercises.filter((e) => e.stage === 'input').flatMap(inputTexts).flatMap(tokenize);
  if (tokens.length === 0) return result('Q3', name, []);

  const failures: string[] = [];
  const unknown = tokens.filter((t) => !ctx.knownForms!.has(t));
  const coverage = 1 - unknown.length / tokens.length;
  if (coverage < params.inputCoverage)
    failures.push(
      `input coverage ${(coverage * 100).toFixed(1)}% is below ${params.inputCoverage * 100}% ` +
        `(unknown: ${[...new Set(unknown)].slice(0, 20).join(', ')})`,
    );
  const unglossed = [...new Set(unknown.filter((t) => !glossed.has(t)))];
  if (unglossed.length) failures.push(`new words in input are not in vocabulary: ${unglossed.join(', ')}`);
  return result('Q3', name, failures);
}

function checkNewLoad(lesson: LessonContent, ctx: CheckContext, params: FrameworkParams): CheckResult {
  const failures: string[] = [];
  const maxLemmas = lesson.mode === 'immersive' ? params.maxNewLemmasImmersive : params.maxNewLemmasQuick;
  const newLemmas = lesson.vocabulary.filter((v) => v.isNew).length;
  if (newLemmas > maxLemmas) failures.push(`${newLemmas} new lemmas (max ${maxLemmas})`);
  if (ctx.objectiveTypes && ctx.masteredObjectiveIds) {
    const newGrammar = lesson.objectiveIds.filter(
      (o) => ctx.objectiveTypes!.get(o) === 'grammar' && !ctx.masteredObjectiveIds!.has(o),
    );
    if (newGrammar.length > params.maxNewGrammarPoints)
      failures.push(`${newGrammar.length} new grammar points (max ${params.maxNewGrammarPoints}): ${newGrammar.join(', ')}`);
  }
  return result('Q4', 'New-load limits', failures);
}

function checkRecycling(lesson: LessonContent, ctx: CheckContext, params: FrameworkParams): CheckResult {
  const name = 'Recycling';
  if (!ctx.previouslySeenObjectiveIds || ctx.previouslySeenObjectiveIds.size === 0) return result('Q5', name, []);
  const practice = lesson.exercises.filter((e) => PRACTICE_STAGES.has(e.stage));
  if (practice.length === 0) return result('Q5', name, []);
  const recycled = practice.filter((e) => e.objectiveIds.some((o) => ctx.previouslySeenObjectiveIds!.has(o))).length;
  const share = recycled / practice.length;
  return result(
    'Q5',
    name,
    share < params.minRecycledShare
      ? [`${(share * 100).toFixed(0)}% of practice recycles earlier objectives (min ${params.minRecycledShare * 100}%)`]
      : [],
  );
}

function checkAnswerKeys(lesson: LessonContent): CheckResult {
  const failures: string[] = [];
  for (const e of lesson.exercises) {
    if (e.type === 'multiple_choice' || e.type === 'listen_choose') {
      if (e.correct >= e.options.length) failures.push(`${e.id}: correct index ${e.correct} is out of range`);
      const norm = e.options.map(normalizeAnswer);
      if (new Set(norm).size !== norm.length) failures.push(`${e.id}: options are not distinct`);
      if (e.optionErrors) {
        if (e.optionErrors.length !== e.options.length)
          failures.push(`${e.id}: optionErrors has ${e.optionErrors.length} entries for ${e.options.length} options`);
        else if (e.optionErrors[e.correct] != null) failures.push(`${e.id}: the correct option must not carry an error tag`);
      }
    }
    if (e.type === 'type_answer') {
      const norm = e.accepted.map(normalizeAnswer);
      if (norm.some((a) => a.length === 0)) failures.push(`${e.id}: an accepted answer has no words`);
    }
    if (e.type === 'word_order') {
      if (new Set(e.tokens.map((t) => t.toLocaleLowerCase('es'))).size === 1)
        failures.push(`${e.id}: all tokens are identical, so the order cannot be checked`);
    }
  }
  return result('Q6', 'Answer keys', failures);
}

/** Forms that belong to specific varieties. Deliberately small; extend from the lexicon later. */
const VARIETY_MARKERS: Record<string, { allowedIn: readonly Variety[]; label: string }> = {
  vosotros: { allowedIn: ['es-ES'], label: 'vosotros (Spain only)' },
  vosotras: { allowedIn: ['es-ES'], label: 'vosotras (Spain only)' },
  vuestro: { allowedIn: ['es-ES'], label: 'vuestro (Spain only)' },
  vuestra: { allowedIn: ['es-ES'], label: 'vuestra (Spain only)' },
  vuestros: { allowedIn: ['es-ES'], label: 'vuestros (Spain only)' },
  vuestras: { allowedIn: ['es-ES'], label: 'vuestras (Spain only)' },
  vos: { allowedIn: ['es-AR'], label: 'vos (voseo)' },
};

function lessonTexts(lesson: LessonContent): string[] {
  const texts: string[] = [lesson.title, ...lesson.vocabulary.flatMap((v) => [v.lemma, ...(v.forms ?? [])])];
  for (const e of lesson.exercises) {
    texts.push(...inputTexts(e));
    if (e.type === 'multiple_choice' || e.type === 'listen_choose') texts.push(...e.options);
    if (e.type === 'word_order') texts.push(...e.tokens);
    if (e.type === 'type_answer') texts.push(...e.accepted);
  }
  return texts;
}

function checkVariety(lesson: LessonContent): CheckResult {
  const found = new Set<string>();
  for (const token of lessonTexts(lesson).flatMap(tokenize)) {
    const marker = VARIETY_MARKERS[token];
    if (marker && !marker.allowedIn.includes(lesson.variety)) found.add(marker.label);
  }
  return result('Q7', 'Variety consistency', [...found].map((l) => `uses ${l} but the lesson variety is ${lesson.variety}`));
}

function checkTiming(lesson: LessonContent, params: FrameworkParams): CheckResult {
  const seconds = lesson.exercises.reduce((s, e) => s + (e.estSeconds ?? EXERCISE_TYPE_INFO[e.type].defaultSeconds), 0);
  const declared = lesson.estMinutes * 60;
  const diff = Math.abs(seconds - declared) / declared;
  return result(
    'Q10',
    'Timing',
    diff > params.timingTolerance
      ? [`exercises add up to ${Math.round(seconds / 60)} min but estMinutes is ${lesson.estMinutes}`]
      : [],
  );
}
