/**
 * Goal feasibility (docs/CONTENT_FRAMEWORK.md §2). Pure arithmetic, done before any AI is involved.
 */
import { DEFAULT_PARAMS, type FrameworkParams } from './framework';

export interface FeasibilityInput {
  /** Estimated hours of each objective still to master on the current plan. */
  remainingObjectiveHours: readonly number[];
  weeklyHours: number;
  today: Date;
  deadline?: Date;
  /**
   * Learner's measured actual/estimated hours ratio (e.g. 1.3 = takes 30% longer than estimated).
   * Leave undefined until there is enough history; the external estimates are then used as-is.
   */
  paceFactor?: number;
}

export type FeasibilityStatus = 'on_track' | 'tight' | 'not_feasible' | 'no_deadline';

export interface Feasibility {
  status: FeasibilityStatus;
  hoursNeeded: number;
  hoursAvailable: number | null;
  ratio: number | null;
  projectedCompletion: Date | null;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function assessFeasibility(input: FeasibilityInput, params: FrameworkParams = DEFAULT_PARAMS): Feasibility {
  if (input.weeklyHours < 0) throw new RangeError('weeklyHours must be ≥ 0');
  const factor = input.paceFactor ?? 1;
  const hoursNeeded = round(input.remainingObjectiveHours.reduce((a, h) => a + h, 0) * factor);
  const projectedCompletion =
    input.weeklyHours > 0 ? new Date(input.today.getTime() + (hoursNeeded / input.weeklyHours) * MS_PER_WEEK) : null;

  if (!input.deadline) {
    return { status: 'no_deadline', hoursNeeded, hoursAvailable: null, ratio: null, projectedCompletion };
  }
  const weeks = Math.max(0, (input.deadline.getTime() - input.today.getTime()) / MS_PER_WEEK);
  const hoursAvailable = round(weeks * input.weeklyHours);
  const ratio = hoursNeeded === 0 ? Infinity : hoursAvailable / hoursNeeded;
  const status: FeasibilityStatus =
    ratio >= params.feasibility.onTrack ? 'on_track' : ratio >= params.feasibility.tight ? 'tight' : 'not_feasible';
  return { status, hoursNeeded, hoursAvailable, ratio: ratio === Infinity ? ratio : round(ratio), projectedCompletion };
}

const round = (n: number) => Math.round(n * 100) / 100;
