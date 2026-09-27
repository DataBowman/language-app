import type { LessonContent, Objective } from '../src';

export const MEDIA = '3f1c2b1e-8a4d-4c7e-9f00-1234567890ab';

/** A small immersive lesson that passes every check. Tests mutate copies of it. */
export function validLesson(): LessonContent {
  return {
    schemaVersion: 1,
    mode: 'immersive',
    variety: 'es-MX',
    cefr: 'A1',
    title: 'Mi rutina de la mañana',
    objectiveIds: ['cd.daily_routine', 'gr.reflexive_present'],
    estMinutes: 5,
    vocabulary: [
      { lemma: 'despertarse', gloss: 'to wake up', isNew: true, forms: ['me despierto'] },
      { lemma: 'levantarse', gloss: 'to get up', isNew: true, forms: ['me levanto'] },
    ],
    exercises: [
      {
        id: 'warm1',
        stage: 'warm_up',
        type: 'multiple_choice',
        objectiveIds: ['cd.daily_routine'],
        prompt: { text: '¿Qué hora es?', tts: false },
        options: ['Son las siete', 'Es azul'],
        correct: 0,
      },
      {
        id: 'in1',
        stage: 'input',
        type: 'listen_repeat',
        objectiveIds: ['gr.reflexive_present'],
        prompt: { text: 'Escucha y repite.', tts: true },
        text: 'Me despierto a las siete.',
      },
      {
        id: 'prac1',
        stage: 'controlled_practice',
        type: 'type_answer',
        objectiveIds: ['gr.reflexive_present'],
        prompt: { text: 'Yo ___ a las ocho. (levantarse)', tts: false },
        accepted: ['me levanto'],
      },
      {
        id: 'prod1',
        stage: 'free_production',
        type: 'describe_image',
        objectiveIds: ['cd.daily_routine'],
        prompt: { mediaId: MEDIA, text: '¿Qué hace la persona?', tts: true },
        estSeconds: 170,
      },
    ],
  };
}

export function objective(id: string, over: Partial<Objective> = {}): Objective {
  const prefixType = { cd: 'can_do', gr: 'grammar', vo: 'vocab_set', fn: 'function', pr: 'pronunciation', cu: 'culture' } as const;
  return {
    id,
    type: prefixType[id.split('.')[0] as keyof typeof prefixType],
    cefr: 'A1',
    skills: ['speaking'],
    title: id,
    description: id,
    prerequisites: [],
    estHours: 2,
    mastery: { threshold: 0.8, distinctDays: 3, requiresProduction: false },
    ...over,
  };
}
