/**
 * Content framework parameters (docs/CONTENT_FRAMEWORK.md §11).
 * Bump FRAMEWORK_VERSION whenever a default changes; it is recorded with every generated lesson.
 */
export const FRAMEWORK_VERSION = '0.1.0';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Spanish varieties (BCP 47). All content in a lesson must use one. */
export const VARIETIES = ['es-ES', 'es-MX', 'es-AR', 'es-419'] as const;
export type Variety = (typeof VARIETIES)[number];

export const SKILLS = ['listening', 'speaking', 'reading', 'writing'] as const;
export type Skill = (typeof SKILLS)[number];

export interface FrameworkParams {
  /** Share of known words required in input texts (§5.1). */
  inputCoverage: number;
  /** Share of known words required in extended listening (§5.1). */
  listeningCoverage: number;
  /** Maximum new lemmas in one immersive lesson. */
  maxNewLemmasImmersive: number;
  /** Maximum new lemmas in one quick pack. */
  maxNewLemmasQuick: number;
  /** Maximum new grammar objectives in one lesson. */
  maxNewGrammarPoints: number;
  /** Minimum share of practice exercises that recycle earlier objectives. */
  minRecycledShare: number;
  /** Allowed difference between the estimated and declared lesson length. */
  timingTolerance: number;
  /** Feasibility ratio thresholds (§2). */
  feasibility: { onTrack: number; tight: number };
}

export const DEFAULT_PARAMS: FrameworkParams = {
  inputCoverage: 0.95,
  listeningCoverage: 0.98,
  maxNewLemmasImmersive: 12,
  maxNewLemmasQuick: 3,
  maxNewGrammarPoints: 1,
  minRecycledShare: 0.3,
  timingTolerance: 0.25,
  feasibility: { onTrack: 1.1, tight: 0.8 },
};
