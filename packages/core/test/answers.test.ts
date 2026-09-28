import { describe, expect, it } from 'vitest';
import { classifyTypedAnswer } from '../src';

describe('classifyTypedAnswer', () => {
  const accepted = ['me levanto'];
  it('accepts exact answers ignoring case and punctuation', () => {
    expect(classifyTypedAnswer('Me levanto.', accepted)).toMatchObject({ answerClass: 'correct', score: 1 });
  });
  it('separates a missing accent from not knowing the word', () => {
    expect(classifyTypedAnswer('esta', ['está'])).toMatchObject({ answerClass: 'accent_only', score: 1, errorTags: ['err.accent'] });
    expect(classifyTypedAnswer('manana', ['mañana'])).toMatchObject({ answerClass: 'accent_only' });
  });
  it('tolerates one typo inside a long word', () => {
    expect(classifyTypedAnswer('me levamto', accepted)).toMatchObject({ answerClass: 'minor_typo', score: 0.5, errorTags: ['err.spelling'] });
  });
  it('never treats a different word ending as a typo (it is grammar)', () => {
    expect(classifyTypedAnswer('me levanta', accepted).answerClass).toBe('wrong');
    expect(classifyTypedAnswer('roja', ['rojo']).answerClass).toBe('wrong');
  });
  it('does not tolerate typos in short words or multiple words', () => {
    expect(classifyTypedAnswer('sol', ['son']).answerClass).toBe('wrong');
    expect(classifyTypedAnswer('ne levamto', accepted).answerClass).toBe('wrong');
  });
  it('treats empty input as wrong', () => {
    expect(classifyTypedAnswer('  ', accepted).answerClass).toBe('wrong');
  });
});
