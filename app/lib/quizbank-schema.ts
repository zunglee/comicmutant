/**
 * Fact Frenzy question bank (content/quiz/<universe>/<slug>.json). Web-researched facts about one
 * published character, written in our own words, one source per question. Server-only: the browser
 * gets a question without its answer (app/lib/quiz-contract.ts).
 */
import { z } from 'zod';

import { PUBLISHED_UNIVERSES } from './taxonomy';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case');

export const TOPICS = [
  'origin',
  'powers',
  'debut',
  'creators',
  'allies',
  'enemies',
  'identity',
  'gear',
  'screen',
  'trivia',
] as const;
export type Topic = (typeof TOPICS)[number];

export const BankQuestion = z
  .object({
    /** `<character-slug>-NN`, stable forever: stats and "facts mastered" key on it. */
    id: z.string().regex(/^[a-z0-9-]+-\d{2}$/),
    q: z.string().min(12).max(170),
    options: z.array(z.string().min(1).max(64)).length(4),
    /** Index into `options` as written; the server shuffles per player. */
    answer: z.number().int().min(0).max(3),
    /** Shown after answering: the fact behind the answer, our own words. */
    why: z.string().min(20).max(240),
    /** 1 = casual fan, 2 = regular reader/viewer, 3 = deep cut. */
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topic: z.enum(TOPICS),
    source: z.string().url().startsWith('https://'),
    /** Set when an answer word also in the question is not a clue (validator Q15 check). */
    giveawayOk: z.boolean().optional(),
    /** Set when another question of this character prints this answer but it isn't a real clue. */
    siblingOk: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const norm = v.options.map((o) => o.trim().toLowerCase());
    if (new Set(norm).size !== 4) ctx.addIssue({ code: 'custom', message: 'options must differ' });
    if (norm.some((o) => /^(all|none|both) of (the )?above$/.test(o)))
      ctx.addIssue({
        code: 'custom',
        message: 'no "all/none of the above" (options are shuffled)',
      });
    const ans = norm[v.answer] ?? '';
    if (ans.length > 3 && v.q.toLowerCase().includes(ans))
      ctx.addIssue({ code: 'custom', message: 'question gives away its answer' });
  });
export type BankQuestion = z.infer<typeof BankQuestion>;

export const BankFile = z
  .object({
    character: slug,
    universe: z.enum(PUBLISHED_UNIVERSES),
    questions: z.array(BankQuestion).min(8).max(14),
  })
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    const qs = new Set<string>();
    for (const q of f.questions) {
      if (!q.id.startsWith(`${f.character}-`))
        ctx.addIssue({ code: 'custom', message: `${q.id}: id must start with ${f.character}-` });
      if (ids.has(q.id)) ctx.addIssue({ code: 'custom', message: `${q.id}: duplicate id` });
      ids.add(q.id);
      const k = q.q.trim().toLowerCase();
      if (qs.has(k)) ctx.addIssue({ code: 'custom', message: `${q.id}: duplicate question` });
      qs.add(k);
    }
    const topics = new Set(f.questions.map((q) => q.topic));
    if (topics.size < 4) ctx.addIssue({ code: 'custom', message: 'cover at least 4 topics' });
    for (const d of [1, 2, 3] as const) {
      if (f.questions.filter((q) => q.difficulty === d).length < 2)
        ctx.addIssue({ code: 'custom', message: `need at least 2 questions of difficulty ${d}` });
    }
  });
export type BankFile = z.infer<typeof BankFile>;
