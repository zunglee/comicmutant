/**
 * Sacred India content contract (reports/sacred-design.md). One JSON per figure under
 * content/sacred/<tradition>/<slug>.json. Separate from `Character` on purpose: these are figures
 * of living faiths, so there are no power stats, versus prompts, gossip "spice" or hero/villain kinds.
 *
 * Respect rules the schema can enforce: every fact carries a source; claims about the divine are
 * attributed ("In the Valmiki Ramayana…", "Hindus believe…") — checked by scripts/validate-sacred.ts.
 */
import { z } from 'zod';
import { SACRED_GROUPS, SACRED_SYMBOLS, TRADITIONS } from './sacred-taxonomy';
import { QuizItem } from './schema';

export * from './sacred-taxonomy';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case');
const https = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https URL');

export const FACT_KINDS = [
  'story', // an episode from the texts, retold in our own words
  'symbol', // vahana, weapon, colour, emblem and what it means
  'family', // relations, birth, lineage
  'text', // which scripture says what, versions and variants
  'place', // temples, pilgrim sites, geography
  'festival', // festivals, fasts, rituals
  'art', // art, dance, music, cinema, literature
  'language', // names, epithets, word origins
  'history', // dated real-world history (Gurus, Buddha's life, temple dates)
  'teaching', // a teaching or value, stated plainly
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const SacredFact = z.object({
  text: z.string().min(25).max(260),
  kind: z.enum(FACT_KINDS),
  /** Page that supports the fact (Wikipedia section, scripture translation, museum, ASI…). */
  source: https,
  /** Fact critic's "would a curious 12-year-old say 'whoa'?" score, 1–10. Kept facts are ≥ 7. */
  interest: z.number().int().min(1).max(10),
  /** Short enough and gentle enough for the kids' fact deck. */
  kid: z.boolean().default(false),
});
export type SacredFact = z.infer<typeof SacredFact>;

export const Relation = z.object({
  relation: z.string().min(2).max(40),
  name: z.string().min(2).max(60),
  /** Roster slug when the relative has a profile. */
  slug: slug.optional(),
});

export const StoryStep = z.object({
  title: z.string().min(2).max(60),
  /** One scene in our own words, at a 10-year-old's reading level. No quoted verse. */
  text: z.string().min(30).max(360),
});

export const Figure = z.object({
  slug,
  name: z.string().min(2).max(60),
  /** Other names and epithets, e.g. Vinayaka, Ganapati. */
  aka: z.array(z.string().min(2).max(40)).max(10).default([]),
  /** Name in the tradition's own script (Devanagari, Gurmukhi, Pali in Devanagari…). */
  native: z.string().min(1).max(60).optional(),
  tradition: z.enum(TRADITIONS),
  group: z.enum(SACRED_GROUPS),
  /** One line: "God of wisdom and new beginnings", "Fifth Sikh Guru". */
  role: z.string().min(4).max(80),
  summary: z.string().min(40).max(280),
  /** Who they are, in our own words, attributed where the texts differ. */
  about: z.string().min(200).max(1400),
  /** For kids: 2–4 sentences, warm and simple. */
  kidSummary: z.string().min(60).max(400),
  /** Retelling in steps for the kids' story walk (3–6). */
  story: z.array(StoryStep).min(3).max(6),
  /** What the tradition says this figure teaches. Plain values, no preaching. */
  teaches: z.array(z.string().min(5).max(120)).min(1).max(4),
  /** Visual motif for the card art — generic, never a face or a drawn deity. */
  symbol: z.enum(SACRED_SYMBOLS),
  /** Known emblems and mounts, as text (e.g. "Mouse (vahana)", "Lotus"). */
  emblems: z.array(z.string().min(2).max(60)).max(8).default([]),
  family: z.array(Relation).max(12).default([]),
  texts: z.array(z.string().min(2).max(80)).min(1).max(8),
  places: z.array(z.string().min(2).max(80)).max(8).default([]),
  festivals: z.array(z.string().min(2).max(60)).max(6).default([]),
  facts: z.array(SacredFact).min(8).max(32),
  quiz: z.array(QuizItem).min(3).max(6),
  related: z.array(slug).max(10).default([]),
  sources: z.object({ wikipedia: https }).catchall(https),
  /**
   * full = ≥ 20 facts (the standard); compact = sources genuinely hold fewer verifiable facts
   * (some Tirthankaras, minor sages). Never padded — see sacred-design.md S5.
   */
  depth: z.enum(['full', 'compact']).default('full'),
  /** Card palette: soft colours only (validator keeps them calm). */
  palette: z.object({
    c1: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    c2: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  /** Lifespan or era for historical figures, e.g. "1469–1539" (Gurus, the Buddha, saints). */
  years: z.string().min(3).max(40).optional(),
  /** Display order inside the group (avatars 1–10, Gurus 1–10, Tirthankaras 1–24). */
  order: z.number().int().min(0).max(999).default(500),
});
export type Figure = z.infer<typeof Figure>;
