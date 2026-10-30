/**
 * Zod-free taxonomy: the lists and labels the browser needs. app/lib/schema.ts builds its
 * validators from these, so client code imports this file and never pulls zod into a bundle.
 * Adding a universe = one row in UNIVERSE_TABLE.
 */

export const UNIVERSE_TABLE = [
  { id: 'marvel', label: 'Marvel', published: true },
  { id: 'dc', label: 'DC', published: true },
  { id: 'indian', label: 'Desi', published: true },
  { id: 'anime', label: 'Anime & Manga', published: true },
  { id: 'other', label: 'Indie', published: true },
  { id: 'original', label: 'CM Originals', published: false },
] as const;

export type Universe = (typeof UNIVERSE_TABLE)[number]['id'];
export const UNIVERSES = UNIVERSE_TABLE.map((u) => u.id) as unknown as readonly [
  Universe,
  ...Universe[],
];
export type PublishedUniverse = Extract<(typeof UNIVERSE_TABLE)[number], { published: true }>['id'];
export const PUBLISHED_UNIVERSES = UNIVERSE_TABLE.filter((u) => u.published).map(
  (u) => u.id,
) as unknown as readonly [PublishedUniverse, ...PublishedUniverse[]];
export const UNIVERSE_LABEL = Object.fromEntries(
  UNIVERSE_TABLE.map((u) => [u.id, u.label]),
) as Record<Universe, string>;

export const KINDS = ['hero', 'villain', 'antihero'] as const;
export type Kind = (typeof KINDS)[number];

/** Visual language of a theme's animated clips and background. Never a logo — a generic motif. */
export const MOTIFS = [
  'tech',
  'bolt',
  'flame',
  'ice',
  'cosmic',
  'magic',
  'shadow',
  'speed',
  'strength',
  'nature',
  'web',
  'claw',
  'mind',
  'water',
  'chaos',
  'size',
] as const;
export type Motif = (typeof MOTIFS)[number];
