/** Spanish text helpers used for difficulty checks and answer matching. */

/** Lower-cases and splits into word tokens; keeps accents and ñ (they change meaning). */
export function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase('es')
    .normalize('NFC')
    .split(/[^\p{L}\p{M}]+/u)
    .filter((t) => t.length > 0);
}

/** Lenient form for comparing typed answers: case, accents, punctuation and spacing ignored. */
export function normalizeAnswer(text: string): string {
  return tokenize(text.normalize('NFD').replace(/\p{M}/gu, '')).join(' ');
}
