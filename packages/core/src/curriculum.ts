/**
 * Curriculum graph (docs/CONTENT_FRAMEWORK.md §4): objectives with prerequisites.
 * The plan is a path through this graph; lessons are generated from the plan.
 */
import { z } from 'zod';
import { CEFR_LEVELS, SKILLS, VARIETIES, type CefrLevel } from './framework';

export const OBJECTIVE_TYPES = {
  can_do: 'cd',
  grammar: 'gr',
  vocab_set: 'vo',
  function: 'fn',
  pronunciation: 'pr',
  culture: 'cu',
} as const;
export type ObjectiveType = keyof typeof OBJECTIVE_TYPES;

/** Stable, readable id, e.g. `gr.preterite.regular`. The prefix encodes the type. */
export const OBJECTIVE_ID = z
  .string()
  .regex(/^(cd|gr|vo|fn|pr|cu)\.[a-z0-9_]+(\.[a-z0-9_]+)*$/, 'objective id like gr.ser_estar');

export const Objective = z
  .object({
    id: OBJECTIVE_ID,
    type: z.enum(Object.keys(OBJECTIVE_TYPES) as [ObjectiveType, ...ObjectiveType[]]),
    cefr: z.enum(CEFR_LEVELS),
    skills: z.array(z.enum(SKILLS)).min(1),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(1000).describe('Written for a teacher; AI models read this'),
    prerequisites: z.array(OBJECTIVE_ID).default([]),
    estHours: z.number().positive().max(40),
    mastery: z
      .object({
        threshold: z.number().min(0).max(1).default(0.8),
        distinctDays: z.number().int().min(1).default(3),
        requiresProduction: z.boolean().default(false),
      })
      .default({ threshold: 0.8, distinctDays: 3, requiresProduction: false }),
    variety: z.enum(VARIETIES).optional().describe('Set only when the objective applies to one variety'),
  })
  .refine((o) => o.id.startsWith(OBJECTIVE_TYPES[o.type] + '.'), {
    message: 'id prefix must match type',
    path: ['id'],
  });
export type Objective = z.infer<typeof Objective>;

export interface GraphIssue {
  severity: 'error' | 'warning';
  objectiveId: string;
  message: string;
}

const levelIndex = (l: CefrLevel) => CEFR_LEVELS.indexOf(l);

/** Checks a curriculum graph: duplicates, unknown prerequisites, cycles, level inversions. */
export function validateGraph(objectives: readonly Objective[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const byId = new Map<string, Objective>();
  for (const o of objectives) {
    if (byId.has(o.id)) issues.push({ severity: 'error', objectiveId: o.id, message: 'duplicate id' });
    byId.set(o.id, o);
  }
  for (const o of objectives) {
    for (const p of o.prerequisites) {
      const pre = byId.get(p);
      if (!pre) {
        issues.push({ severity: 'error', objectiveId: o.id, message: `unknown prerequisite ${p}` });
      } else if (levelIndex(pre.cefr) > levelIndex(o.cefr)) {
        issues.push({
          severity: 'warning',
          objectiveId: o.id,
          message: `prerequisite ${p} is at a higher level (${pre.cefr} > ${o.cefr})`,
        });
      }
    }
  }
  for (const cycle of findCycles(byId)) {
    issues.push({ severity: 'error', objectiveId: cycle[0]!, message: `prerequisite cycle: ${cycle.join(' → ')}` });
  }
  return issues;
}

function findCycles(byId: Map<string, Objective>): string[][] {
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[][] = [];
  const visit = (id: string, path: string[]) => {
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting') {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    state.set(id, 'visiting');
    for (const p of byId.get(id)?.prerequisites ?? []) if (byId.has(p)) visit(p, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of byId.keys()) visit(id, []);
  return cycles;
}

/**
 * Orders objectives so every prerequisite comes first; ties broken by CEFR level, then input order.
 * Throws on cycles — call validateGraph first.
 */
export function prerequisiteOrder(objectives: readonly Objective[]): Objective[] {
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const position = new Map(objectives.map((o, i) => [o.id, i]));
  const remaining = new Map(objectives.map((o) => [o.id, o.prerequisites.filter((p) => byId.has(p)).length]));
  const dependents = new Map<string, string[]>();
  for (const o of objectives)
    for (const p of o.prerequisites) if (byId.has(p)) dependents.set(p, [...(dependents.get(p) ?? []), o.id]);

  const rank = (id: string) => levelIndex(byId.get(id)!.cefr) * 1e6 + position.get(id)!;
  const ready = [...remaining].filter(([, n]) => n === 0).map(([id]) => id);
  const out: Objective[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => rank(a) - rank(b));
    const id = ready.shift()!;
    out.push(byId.get(id)!);
    for (const d of dependents.get(id) ?? []) {
      const n = remaining.get(d)! - 1;
      remaining.set(d, n);
      if (n === 0) ready.push(d);
    }
  }
  if (out.length !== objectives.length) throw new Error('curriculum graph has a prerequisite cycle');
  return out;
}
