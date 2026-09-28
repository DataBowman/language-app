/**
 * Bundled curricula (versioned content, reviewed like code). Loaded by the app, edge functions and the
 * MCP server alike. Validated on load, so a bad edit fails loudly rather than producing odd plans.
 */
import esData from '../content/es/objectives.json';
import { Objective, validateGraph } from './curriculum';
import type { TargetLanguage } from './framework';

const RAW: Record<TargetLanguage, unknown> = { es: esData };
const cache = new Map<TargetLanguage, Objective[]>();

export function loadCurriculum(language: TargetLanguage): Objective[] {
  const hit = cache.get(language);
  if (hit) return hit;
  const data = RAW[language] as { objectives: unknown[] };
  const objectives = data.objectives.map((o) => Objective.parse(o));
  const errors = validateGraph(objectives).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(`curriculum ${language} is invalid: ${errors.map((e) => `${e.objectiveId}: ${e.message}`).join('; ')}`);
  cache.set(language, objectives);
  return objectives;
}
