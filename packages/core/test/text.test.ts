import { describe, expect, it } from 'vitest';
import { normalizeAnswer, tokenize } from '../src';

describe('text', () => {
  it('tokenizes Spanish keeping accents', () => {
    expect(tokenize('¿Cómo estás, Ñoño?')).toEqual(['cómo', 'estás', 'ñoño']);
  });
  it('normalizes typed answers leniently', () => {
    expect(normalizeAnswer('  Me LEVANTO! ')).toBe('me levanto');
    expect(normalizeAnswer('Está')).toBe(normalizeAnswer('esta'));
  });
});
