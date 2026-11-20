/**
 * Content contract. Every JSON file under content/ is parsed with these schemas at build time
 * (scripts/build-themes.ts) and in the unit tests, so a bad file fails loudly before it ships.
 *
 * IP boundary (README § IP): `Character` = real, published characters → facts, gossip, quiz,
 * storyline summaries and colour themes only. `Fighter` = ComicMutant originals → the only cast
 * allowed in the canvas games and in drawn figure sprites.
 */
import { z } from 'zod';

import { KINDS, MOTIFS, PUBLISHED_UNIVERSES } from './taxonomy';

export * from './taxonomy';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour must be #rrggbb');
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case');
const year = z.number().int().min(1900).max(2030);
/** Only https links reach an href (no javascript: or data: URLs from content). */
const https = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https URL');

export const ThemeSpec = z.object({
  /** c1 = signature colour, c2 = second colour, c3 = accent/spark. */
  palette: z.object({ c1: hex, c2: hex, c3: hex }),
  motif: z.enum(MOTIFS),
  /** dark = ink page with light text; light = paper page with dark text. */
  mood: z.enum(['dark', 'light']),
  /** Short, original line shown on the theme card. Not a quote from the source. */
  tagline: z.string().min(3).max(70),
});
export type ThemeSpec = z.infer<typeof ThemeSpec>;

export const Gossip = z.object({
  /** fact = plain trivia; gossip = behind-the-scenes; myth = popular belief that is wrong. */
  type: z.enum(['fact', 'gossip', 'myth']),
  text: z.string().min(10).max(260),
  /** For a myth: the correction. */
  truth: z.string().min(5).max(260).optional(),
  /** 1 mild … 3 spicy — drives the card's stamp, not truthfulness. */
  spice: z.number().int().min(1).max(3),
});
export type Gossip = z.infer<typeof Gossip>;

export const QuizItem = z.object({
  q: z.string().min(8).max(160),
  options: z.array(z.string().min(1).max(60)).length(4),
  answer: z.number().int().min(0).max(3),
  why: z.string().min(5).max(200),
});
export type QuizItem = z.infer<typeof QuizItem>;

export const StoryBeat = z.object({
  era: z.string().min(2).max(40),
  years: z.string().min(4).max(20),
  title: z.string().min(2).max(60),
  /** Plain-English summary in our own words. No quoted dialogue or panel descriptions. */
  beat: z.string().min(20).max(420),
});
export type StoryBeat = z.infer<typeof StoryBeat>;

/**
 * One dated beat on the multiverse timeline. Facts only, in our own words; `year` is the real-world
 * year it happened (publication / release), not an in-story date.
 */
export const Milestone = z.object({
  year,
  kind: z.enum(['debut', 'comic', 'screen', 'turn', 'death', 'return', 'legacy']),
  title: z.string().min(3).max(60),
  note: z.string().min(10).max(200),
  /** Another roster character this beat involves (a rival, a team-up). */
  with: slug.optional(),
});
export type Milestone = z.infer<typeof Milestone>;

export const Photo = z.object({
  file: z.string(),
  alt: z.string(),
  artist: z.string(),
  license: z.string(),
  // Absent for public-domain files.
  licenseUrl: https.optional(),
  sourcePage: https,
  objectPosition: z.string().optional(),
});

/** A sourced, critic-scored fact (≥ 20 per Desi hero; reports/sacred-design.md S9). */
export const CharacterFact = z.object({
  text: z.string().min(25).max(260),
  kind: z.enum([
    'origin',
    'creator',
    'publishing',
    'screen',
    'powers',
    'story',
    'culture',
    'record',
  ]),
  source: https,
  /** Fact critic's interest score, 1–10. Kept facts are ≥ 7. */
  interest: z.number().int().min(1).max(10),
});
export type CharacterFact = z.infer<typeof CharacterFact>;

export const Character = z.object({
  slug,
  name: z.string().min(1).max(50),
  realName: z.string().max(80).optional(),
  universe: z.enum(PUBLISHED_UNIVERSES),
  kind: z.enum(KINDS),
  /** Where the character first lived: comics, film, tv, animation, manga, game, novel. */
  medium: z.enum(['comics', 'film', 'tv', 'animation', 'manga', 'game', 'novel']),
  publisher: z.string().min(2).max(60),
  summary: z.string().min(20).max(260),
  origin: z.string().min(40).max(900),
  creators: z.array(z.string()).min(1),
  firstAppearance: z.object({ title: z.string(), issue: z.string().optional(), year }),
  powers: z.array(z.string().min(2).max(140)).min(1).max(12),
  affiliations: z.array(z.string()).max(12).default([]),
  storyline: z.array(StoryBeat).min(3).max(7),
  gossip: z.array(Gossip).min(4).max(10),
  quiz: z.array(QuizItem).min(2).max(6),
  rivals: z.array(slug).max(6).default([]),
  allies: z.array(slug).max(6).default([]),
  theme: ThemeSpec,
  sources: z.object({ wikipedia: https }).catchall(https),
  photo: Photo.optional(),
  /** Real-world milestones, oldest first (the /timeline page and the character page). */
  timeline: z.array(Milestone).min(4).max(10).optional(),
  /** Long-form facts deck (Desi heroes carry ≥ 20). */
  facts: z.array(CharacterFact).max(32).optional(),
  /** Trending weight 0–100 for the default top-5 and "hot" sort. */
  heat: z.number().int().min(0).max(100).default(50),
});
export type Character = z.infer<typeof Character>;

/** A ComicMutant original. Drawn by the sprite rig; the only cast in games. */
export const Fighter = z.object({
  slug,
  name: z.string().min(2).max(30),
  alias: z.string().min(2).max(30),
  kind: z.enum(KINDS),
  archetype: z.string().min(3).max(40),
  bio: z.string().min(20).max(400),
  catchphrase: z.string().min(3).max(80),
  rig: z.object({
    build: z.enum(['slim', 'normal', 'heavy']),
    head: z.enum(['mask', 'helmet', 'hood', 'bare', 'horns', 'crown', 'visor']),
    cape: z.boolean(),
    skin: hex,
    suit: hex,
    trim: hex,
    eye: hex,
    /** Original geometric chest mark. */
    emblem: z.enum(['bolt', 'star', 'ring', 'diamond', 'chevron', 'eye', 'fang', 'none']),
  }),
  stats: z.object({
    power: z.number().int().min(1).max(10),
    speed: z.number().int().min(1).max(10),
    defense: z.number().int().min(1).max(10),
    special: z.number().int().min(1).max(10),
  }),
  special: z.object({
    name: z.string().min(3).max(30),
    kind: z.enum(['beam', 'dash', 'shockwave', 'projectile', 'teleport']),
  }),
  rivals: z.array(slug).max(4).default([]),
  theme: ThemeSpec,
  heat: z.number().int().min(0).max(100).default(40),
});
export type Fighter = z.infer<typeof Fighter>;

/**
 * A famous gadget, dissected. Facts in our own words; the drawing is an original, deliberately
 * generic blueprint (`blueprint` picks the template), never a copy of the published design.
 */
export const BLUEPRINTS = [
  'vehicle',
  'armor',
  'shield',
  'hammer',
  'gauntlet',
  'ring',
  'belt',
] as const;
export const Gadget = z.object({
  slug,
  name: z.string().min(2).max(50),
  /** Roster slug of the owner. */
  owner: slug,
  firstSeen: z.object({ title: z.string().min(2).max(80), year }),
  summary: z.string().min(20).max(260),
  blueprint: z.enum(BLUEPRINTS),
  /** One part per template slot, in slot order (see app/components/gadgets.tsx SLOTS). */
  parts: z
    .array(
      z.object({
        label: z.string().min(2).max(40),
        fact: z.string().min(15).max(220),
      }),
    )
    .min(4)
    .max(6),
  /** Plain trivia shown under the teardown. */
  trivia: z.array(z.string().min(15).max(220)).min(2).max(5),
  sources: z.array(https).min(1).max(6),
});
export type Gadget = z.infer<typeof Gadget>;
