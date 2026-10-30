/** Constants shared by the community server code and its forms. Safe to import on the client. */

export const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Names nobody can register: staff-looking or brand names. Compared after folding look-alikes. */
export const RESERVED_NAMES = [
  'admin',
  'administrator',
  'mod',
  'moderator',
  'comicmutant',
  'official',
  'staff',
  'support',
  'system',
  'root',
];
export const TAKE_MAX = 220;

/** Sound-effect reactions. Text stickers, not emoji — they are the site's visual language. */
export const REACTIONS = [
  { id: 'pow', label: 'POW!', hint: 'Hits hard' },
  { id: 'facts', label: 'FACTS', hint: 'Agree' },
  { id: 'lol', label: 'HA-HA', hint: 'Funny' },
  { id: 'cap', label: 'CAP', hint: 'Not buying it' },
  { id: 'mind', label: 'WHOA', hint: 'Mind blown' },
] as const;
export type ReactionId = (typeof REACTIONS)[number]['id'];
export const REACTION_IDS = REACTIONS.map((r) => r.id) as unknown as readonly ReactionId[];

/**
 * Versus prompts compare two published characters on opinion questions. They never ask for an
 * invented outcome or alternate story (IP boundary, README § IP).
 */
export const VERSUS_PROMPTS = {
  origin: 'Cooler origin story?',
  look: 'Better costume design?',
  brains: 'Sharper mind?',
  villain: 'Scarier villain?',
  comeback: 'Best comeback in their history?',
  team: 'Who would you want on your team?',
  rewatch: 'More fun to read or watch?',
  legacy: 'Bigger cultural legacy?',
} as const;
export type VersusPrompt = keyof typeof VERSUS_PROMPTS;

/** Avatars are original theme slugs the user picks from (originals only). */
export const AVATAR_FALLBACK = 'house';
