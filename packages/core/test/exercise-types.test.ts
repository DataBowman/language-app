import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPE_INFO, EXERCISE_TYPES, typesForMode } from '../src';

describe('exercise-type registry', () => {
  it('only allows auto-scored types in quick mode (ADR 0007)', () => {
    for (const t of typesForMode('quick')) expect(EXERCISE_TYPE_INFO[t].autoScored, t).toBe(true);
  });

  it('allows every type in at least one mode', () => {
    for (const t of EXERCISE_TYPES) expect(EXERCISE_TYPE_INFO[t].modes.length, t).toBeGreaterThan(0);
  });
});
