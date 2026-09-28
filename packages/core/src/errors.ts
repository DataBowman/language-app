/**
 * Error categories (docs/LEARNING_DATA.md). Stable ids attached to wrong answers, distractors and
 * assessments, so recurring misconceptions can be counted over time. Add new ids; never rename one.
 */
import { z } from 'zod';

export const ERROR_TAGS = {
  'err.accent': 'Missing or wrong written accent (está / esta)',
  'err.spelling': 'Spelling mistake in an otherwise correct word',
  'err.gender_agreement': 'Noun/adjective/article gender does not agree',
  'err.number_agreement': 'Singular/plural does not agree',
  'err.verb_person': 'Wrong person of the verb (me levanto / se levanta)',
  'err.verb_tense': 'Wrong tense or aspect (preterite vs imperfect, …)',
  'err.verb_mood': 'Wrong mood (indicative vs subjunctive)',
  'err.ser_estar': 'Confuses ser and estar',
  'err.por_para': 'Confuses por and para',
  'err.preposition': 'Wrong or missing preposition',
  'err.article': 'Wrong, missing or extra article',
  'err.pronoun': 'Wrong object/reflexive pronoun or its position',
  'err.word_order': 'Words in the wrong order',
  'err.vocab_confusion': 'Chose a related but wrong word (false friend, similar meaning)',
  'err.comprehension': 'Did not understand the input',
  'err.pronunciation': 'Pronunciation made the word hard to understand',
  'err.register': 'Wrong formality (tú / usted)',
  'err.variety': 'Form from a different Spanish variety than the one being learned',
} as const;

export type ErrorTag = keyof typeof ERROR_TAGS;
export const ErrorTag = z.enum(Object.keys(ERROR_TAGS) as [ErrorTag, ...ErrorTag[]]);
