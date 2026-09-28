/**
 * Learner context (ADR 0014): everything about the learner is configuration or derived from evidence,
 * never assumed in code. Variety, goal and time budget are selected (and may change at any time);
 * level is estimated from evidence. "Not known yet" is a normal state every consumer must handle.
 */
import { z } from 'zod';
import type { Objective } from './curriculum';
import type { ObjectiveEvidence } from './evidence';
import { CEFR_LEVELS, SKILLS, TARGET_LANGUAGES, VARIETIES, type CefrLevel, type Skill, type Variety } from './framework';

export const LearnerSettings = z.object({
  targetLanguage: z.enum(TARGET_LANGUAGES).default('es'),
  /** null = not chosen yet: content uses neutral Spanish until it is. */
  variety: z.enum(VARIETIES).nullable().default(null),
  /** null = unknown: plans use a conservative default and learn the real pace from activity. */
  weeklyMinutes: z.number().int().min(10).max(3000).nullable().default(null),
  /** Share of time for quick practice (vs immersive); null = let the planner decide. */
  quickShare: z.number().min(0).max(1).nullable().default(null),
  /** auto = plan revisions apply immediately (tutor notified, can revert); tutor_approval = wait. */
  planAutonomy: z.enum(['auto', 'tutor_approval']).default('auto'),
  uiLanguage: z.enum(['en', 'es']).default('en'),
});
export type LearnerSettings = z.infer<typeof LearnerSettings>;

export const Goal = z
  .object({
    kind: z.enum(['challenge', 'level', 'custom']),
    challengeId: z.uuid().optional(),
    targetLevel: z.enum(CEFR_LEVELS).optional(),
    description: z.string().max(1000).optional(),
    targetDate: z.iso.date().nullable().default(null),
    status: z.enum(['active', 'paused', 'achieved', 'dropped']).default('active'),
  })
  .refine((g) => g.kind !== 'challenge' || g.challengeId, { message: 'challenge goals need challengeId', path: ['challengeId'] })
  .refine((g) => g.kind !== 'level' || g.targetLevel, { message: 'level goals need targetLevel', path: ['targetLevel'] })
  .refine((g) => g.kind !== 'custom' || g.description, { message: 'custom goals need a description', path: ['description'] });
export type Goal = z.infer<typeof Goal>;

/** Defaults used only when a setting is unknown; kept here so every consumer agrees. */
export const UNKNOWN_DEFAULTS = { weeklyMinutes: 60, quickShare: 0.4 } as const;

export interface EffectiveContext {
  targetLanguage: 'es';
  variety: Variety;
  weeklyMinutes: number;
  quickShare: number;
  /** Which values were defaults because the real one is unknown — show "we're still learning this". */
  assumed: ('variety' | 'weeklyMinutes' | 'quickShare')[];
}

export function effectiveContext(settings: LearnerSettings): EffectiveContext {
  const assumed: EffectiveContext['assumed'] = [];
  if (settings.variety === null) assumed.push('variety');
  if (settings.weeklyMinutes === null) assumed.push('weeklyMinutes');
  if (settings.quickShare === null) assumed.push('quickShare');
  return {
    targetLanguage: settings.targetLanguage,
    variety: settings.variety ?? 'es',
    weeklyMinutes: settings.weeklyMinutes ?? UNKNOWN_DEFAULTS.weeklyMinutes,
    quickShare: settings.quickShare ?? UNKNOWN_DEFAULTS.quickShare,
    assumed,
  };
}

// ─── Mastery and level: always derived ──────────────────────────────────────────────────────────

/** The objective's own mastery criteria (CONTENT_FRAMEWORK §4.1); a tutor's "secure" also counts. */
export function isMastered(o: Objective, e: ObjectiveEvidence | undefined): boolean {
  if (!e) return false;
  if (e.tutorLevel === 'secure') return true;
  if (e.tutorLevel === 'struggling') return false;
  return (
    (e.accuracy ?? 0) >= o.mastery.threshold &&
    e.practiceDays >= o.mastery.distinctDays &&
    (!o.mastery.requiresProduction || e.hasProduction)
  );
}

export interface SkillLevel {
  /** Highest level whose objectives are mostly mastered; null = below A1 or no evidence yet. */
  level: CefrLevel | null;
  /** The level being worked on now. */
  working: CefrLevel;
  /** 0–1: how much of the working level has any evidence. Low = the estimate may move a lot. */
  confidence: number;
  masteredAtWorking: number;
  totalAtWorking: number;
}

export const LEVEL_PARAMS = { levelReachedShare: 0.7 };

/**
 * Estimates the level per skill from the curriculum graph and evidence. Recomputed continuously, so it
 * adapts as the learner improves (or turns out to know more than assumed: tutor "secure" marks count).
 */
export function estimateLevels(
  objectives: readonly Objective[],
  evidence: ReadonlyMap<string, ObjectiveEvidence>,
  p = LEVEL_PARAMS,
): Record<Skill, SkillLevel> {
  const out = {} as Record<Skill, SkillLevel>;
  for (const skill of SKILLS) {
    let level: CefrLevel | null = null;
    let working: CefrLevel = CEFR_LEVELS[0];
    for (const l of CEFR_LEVELS) {
      const atLevel = objectives.filter((o) => o.cefr === l && o.skills.includes(skill));
      working = l;
      if (atLevel.length === 0) break; // curriculum does not cover this level yet
      const mastered = atLevel.filter((o) => isMastered(o, evidence.get(o.id))).length;
      if (mastered / atLevel.length < p.levelReachedShare) break;
      level = l;
    }
    const atWorking = objectives.filter((o) => o.cefr === working && o.skills.includes(skill));
    out[skill] = {
      level,
      working,
      confidence: atWorking.length ? round(atWorking.filter((o) => evidence.has(o.id)).length / atWorking.length) : 0,
      masteredAtWorking: atWorking.filter((o) => isMastered(o, evidence.get(o.id))).length,
      totalAtWorking: atWorking.length,
    };
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
