/**
 * Scenario challenges (ADR 0012): real-world goals such as greeting a Spanish-speaking colleague or
 * travelling. A challenge links a scenario to curriculum objectives, so the planner can prioritise what
 * it needs, and readiness is *derived* from evidence, never entered by hand.
 */
import { z } from 'zod';
import { OBJECTIVE_ID } from './curriculum';
import type { ObjectiveEvidence } from './evidence';
import { CEFR_LEVELS, VARIETIES } from './framework';

export const CHALLENGE_SCHEMA_VERSION = 1;

const KeyPhrase = z.object({
  es: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
  note: z.string().max(300).optional().describe('Usage note, e.g. formal vs informal'),
});

export const ChallengeStep = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/),
  title: z.string().min(1).max(120),
  objectiveIds: z.array(OBJECTIVE_ID).min(1).describe('What the learner must be able to do for this step'),
  keyPhrases: z.array(KeyPhrase).max(20).default([]),
  rehearsal: z
    .object({
      exerciseType: z.enum(['conversation', 'describe_image', 'listen_repeat', 'video_response']),
      prompt: z.string().min(1).max(1000).describe('Scenario for the in-app rehearsal (role-play brief)'),
    })
    .optional(),
});

export const Challenge = z.object({
  schemaVersion: z.literal(CHALLENGE_SCHEMA_VERSION),
  title: z.string().min(1).max(120),
  scenario: z.string().min(1).max(2000).describe('The real situation, in plain words'),
  category: z.enum(['social', 'work', 'travel', 'daily_life', 'study', 'other']),
  cefr: z.enum(CEFR_LEVELS),
  variety: z.enum(VARIETIES).optional().describe('Set when the scenario is tied to one country'),
  steps: z.array(ChallengeStep).min(1).max(12),
  successCriteria: z.array(z.string().min(1).max(300)).min(1).max(10).describe('How the learner knows they did it'),
});
export type Challenge = z.infer<typeof Challenge>;
export type ChallengeInput = z.input<typeof Challenge>;

export function challengeObjectiveIds(c: Pick<Challenge, 'steps'>): string[] {
  return [...new Set(c.steps.flatMap((s) => s.objectiveIds))];
}

// ─── Readiness ──────────────────────────────────────────────────────────────────────────────────

/** Tunable heuristic, versioned with the framework (CONTENT_FRAMEWORK §11). */
export const READINESS_PARAMS = {
  /** Days of practice after which accuracy is fully trusted. */
  fullConfidenceDays: 3,
  /** Readiness cap for a step without spoken/written production evidence. */
  noProductionCap: 0.7,
  /** An objective below this counts as a gap. */
  gapThreshold: 0.6,
  ready: 0.75,
  gettingThere: 0.4,
};

export function objectiveReadiness(e: ObjectiveEvidence | undefined, p = READINESS_PARAMS): number {
  if (!e) return 0;
  let r = (e.accuracy ?? 0) * Math.min(1, e.practiceDays / p.fullConfidenceDays);
  if (!e.hasProduction) r = Math.min(r, p.noProductionCap);
  // The tutor has seen the learner do it live: trust that over app evidence in either direction.
  if (e.tutorLevel === 'secure') r = Math.max(r, 0.9);
  if (e.tutorLevel === 'struggling') r = Math.min(r, 0.4);
  return Math.round(r * 100) / 100;
}

export interface ChallengeReadiness {
  readiness: number;
  status: 'not_ready' | 'getting_there' | 'ready';
  steps: { id: string; title: string; readiness: number }[];
  /** Weakest objectives first: what to practise next. */
  gaps: { objectiveId: string; readiness: number }[];
  /** First step that is not yet ready. */
  nextStepId: string | null;
}

export function challengeReadiness(
  c: Pick<Challenge, 'steps'>,
  objectives: ReadonlyMap<string, ObjectiveEvidence>,
  p = READINESS_PARAMS,
): ChallengeReadiness {
  const byObjective = new Map(challengeObjectiveIds(c).map((id) => [id, objectiveReadiness(objectives.get(id), p)]));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const steps = c.steps.map((s) => ({ id: s.id, title: s.title, readiness: round(mean(s.objectiveIds.map((o) => byObjective.get(o)!))) }));
  const readiness = round(mean(steps.map((s) => s.readiness)));
  return {
    readiness,
    status: readiness >= p.ready ? 'ready' : readiness >= p.gettingThere ? 'getting_there' : 'not_ready',
    steps,
    gaps: [...byObjective]
      .filter(([, r]) => r < p.gapThreshold)
      .sort((a, b) => a[1] - b[1])
      .map(([objectiveId, r]) => ({ objectiveId, readiness: r })),
    nextStepId: steps.find((s) => s.readiness < p.ready)?.id ?? null,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

// ─── Starter templates ──────────────────────────────────────────────────────────────────────────
// Variety-neutral drafts for the tutor to review and adapt. Their objective ids are proposals for the
// A1–A2 curriculum seed (ROADMAP Phase 0a).

export const CHALLENGE_TEMPLATES: Record<'greet_colleague' | 'travel_basics', ChallengeInput> = {
  greet_colleague: {
    schemaVersion: 1,
    title: 'Greet a Spanish-speaking colleague',
    scenario:
      'A colleague who speaks Spanish joins a meeting or passes you in the office. Greet them, introduce yourself, ' +
      'exchange a few friendly words, and say goodbye — without switching to English.',
    category: 'work',
    cefr: 'A1',
    steps: [
      {
        id: 'greet',
        title: 'Greet and introduce yourself',
        objectiveIds: ['fn.greetings', 'cd.introduce_self'],
        keyPhrases: [
          { es: 'Buenos días', en: 'Good morning' },
          { es: 'Me llamo…', en: 'My name is…' },
          { es: 'Encantado / Encantada', en: 'Pleased to meet you', note: 'Form agrees with the speaker' },
        ],
        rehearsal: { exerciseType: 'conversation', prompt: 'You meet a new colleague, Marta, at the coffee machine. Greet her and introduce yourself.' },
      },
      {
        id: 'small_talk',
        title: 'Ask how they are and reply',
        objectiveIds: ['cd.small_talk_basic', 'fn.register_tu_usted'],
        keyPhrases: [
          { es: '¿Qué tal?', en: 'How are you?', note: 'Informal' },
          { es: '¿Cómo está usted?', en: 'How are you?', note: 'Formal' },
          { es: 'Muy bien, gracias. ¿Y tú?', en: 'Very well, thanks. And you?' },
        ],
      },
      {
        id: 'goodbye',
        title: 'Say goodbye naturally',
        objectiveIds: ['fn.farewells'],
        keyPhrases: [
          { es: 'Hasta luego', en: 'See you later' },
          { es: 'Que tengas un buen día', en: 'Have a good day' },
        ],
      },
    ],
    successCriteria: [
      'Greeted the colleague in Spanish and said your name',
      'Understood their reply and answered',
      'Ended the conversation in Spanish',
    ],
  },
  travel_basics: {
    schemaVersion: 1,
    title: 'Travel to a Spanish-speaking country',
    scenario:
      'A trip where you get from the airport to your hotel, check in, eat out, find your way around, and sort out a ' +
      'small problem — all in Spanish.',
    category: 'travel',
    cefr: 'A2',
    steps: [
      {
        id: 'transport',
        title: 'Get from the airport to the city',
        objectiveIds: ['cd.buy_ticket', 'vo.transport_basic', 'fn.numbers_prices'],
        rehearsal: { exerciseType: 'conversation', prompt: 'Buy a bus ticket to the city centre and ask when the next bus leaves.' },
      },
      {
        id: 'hotel',
        title: 'Check in at the hotel',
        objectiveIds: ['cd.hotel_checkin', 'fn.spell_name_dates'],
        rehearsal: { exerciseType: 'conversation', prompt: 'Check in at the hotel reception; you have a reservation for three nights.' },
      },
      {
        id: 'food',
        title: 'Order food and pay',
        objectiveIds: ['cd.order_food', 'vo.food_basic', 'fn.polite_requests'],
        keyPhrases: [
          { es: 'Quisiera…, por favor', en: 'I would like…, please' },
          { es: 'La cuenta, por favor', en: 'The bill, please' },
        ],
        rehearsal: { exerciseType: 'conversation', prompt: 'Order a main course and a drink, ask what a dish contains, and ask for the bill.' },
      },
      {
        id: 'directions',
        title: 'Ask for and understand directions',
        objectiveIds: ['cd.ask_directions', 'vo.places_city'],
        rehearsal: { exerciseType: 'describe_image', prompt: 'Look at the map and explain how to get from the hotel to the museum.' },
      },
      {
        id: 'problem',
        title: 'Explain a simple problem',
        objectiveIds: ['cd.explain_problem_simple'],
        rehearsal: { exerciseType: 'conversation', prompt: 'The air conditioning in your room does not work. Tell reception and ask for help.' },
      },
    ],
    successCriteria: [
      'Bought a ticket or took a taxi speaking Spanish',
      'Checked in without switching to English',
      'Ordered a meal and paid',
      'Found a place by asking for directions',
    ],
  },
};
