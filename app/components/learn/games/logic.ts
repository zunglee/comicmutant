/** Pure game logic for the Learning Garden: seeded, so every round is testable. */
import { GROUP_TABLE } from '~/lib/sacred-taxonomy';
import type { LearnFigure } from './types';

/** Small seeded generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: readonly T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export const inGroup = (figs: readonly LearnFigure[], group: string): LearnFigure[] =>
  figs
    .filter((f) => f.group === group)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

/** Well-documented lifespans of the ten Sikh Gurus, by order (used when a profile carries no years). */
export const GURU_YEARS: Record<number, string> = {
  1: '1469–1539',
  2: '1504–1552',
  3: '1479–1574',
  4: '1534–1581',
  5: '1563–1606',
  6: '1595–1644',
  7: '1630–1661',
  8: '1656–1664',
  9: '1621–1675',
  10: '1666–1708',
};
export const yearsOf = (f: LearnFigure): string | undefined =>
  f.years ?? (f.group === 'guru' ? GURU_YEARS[f.order] : undefined);

/** Groups the Symbol Match pool may draw from (kid-friendly, with real mounts / weapons / symbols). */
export const SYMBOL_GROUPS = [
  'trimurti',
  'devi',
  'deva',
  'avatar',
  'divine-being',
  'tirthankara',
  'buddha',
  'bodhisattva',
] as const;
/** Words that make an emblem a real mount, weapon or symbol a child can match. */
export const KID_EMBLEM =
  /\b(mount|vahana|symbol|lanchh?ana|lotus|bow|mace|gada|flute|conch|wheel|discus|chakra|noose|elephant|bull|peacock|swan|hamsa|goose|mouse|lion|tiger|eagle|garuda|snake|serpent|vina|veena|book|axe|sword|plough|fish|tortoise|boar|horse|owl|umbrella|vajra|thunderbolt|damaru|drum|crocodile|makara|deer|goat|monkey|heron|rhinoceros|buffalo|falcon|swastika|crescent|pitcher|spear|vel|ram|crow|dog|parrot|jackal|cow|bear|trident)\b/i;
const EMBLEM_BAD =
  /hermitage|from the|sutta|complexion|colou?r|robes?|clothing|mantra|yaksha|yakshi|gesture|hands?\b|faces?\b|heads?\b|arms?\b|eyes?\b/i;
const cleanEmblem = (e: string) =>
  e
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** Group profiles (plural "figures" like the seven mothers) never make a one-figure match. */
export const GROUP_PROFILES = new Set([
  'vahanas',
  'saptamatrikas',
  'navagraha',
  'ashta-dikpalas',
  'apsaras',
  'gandharvas',
  'ashvins',
  'navadurga',
  'gandharva',
  'matrikas',
  'dikpalas',
  'adityas',
  'rudras',
  'maruts',
]);
const ODD_EMBLEM = /\b(on|at|in|from|with|top|temple|shared|some|modern|images?)\b/i;
const ADJ = new Set(
  (
    'red blue white black green golden gold dark sacred holy great small big tiny giant long short two three four five six seven eight nine ten one ' +
    'with and the her his horned many single divine magic seated flying flaming wish wishing fulfilling shvetambara svetambara digambara mount vahana symbol lanchhana lanchana emblem form'
  ).split(' '),
);
const SYN: Record<string, string> = {
  hamsa: 'swan',
  goose: 'swan',
  chakra: 'wheel',
  discus: 'wheel',
  gada: 'mace',
  vina: 'veena',
  thunderbolt: 'vajra',
  makara: 'crocodile',
  heron: 'heron',
  parashu: 'axe',
  kamandalu: 'pot',
};
/** The words an emblem is "about", for deduping: "Red lotus" and "Lotus" share "lotus". */
export function keyWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^\p{L}]+/u)) {
    if (w.length < 3 || ADJ.has(w)) continue;
    const sing = w.length > 3 && /[^su]s$/.test(w) && !w.endsWith('is') ? w.slice(0, -1) : w;
    out.add(SYN[sing] ?? sing);
  }
  return out;
}
/** Every emblem of a figure that is a short, real mount / weapon / symbol (cleaned of notes). */
export function emblemCandidates(f: Pick<LearnFigure, 'emblems' | 'group' | 'slug'>): string[] {
  if (!(SYMBOL_GROUPS as readonly string[]).includes(f.group) || GROUP_PROFILES.has(f.slug))
    return [];
  const out: string[] = [];
  for (const raw of f.emblems) {
    const t = cleanEmblem(raw);
    if (t.length < 3 || t.length > 30 || t.split(' ').length > 3) continue;
    if (EMBLEM_BAD.test(raw) || ODD_EMBLEM.test(t) || !KID_EMBLEM.test(t)) continue;
    out.push(t);
  }
  return out;
}
/**
 * Figures that qualify for Symbol Match, `emblems` reduced to ONE emblem whose key words belong to no
 * other figure in the pool (so "Lotus" can never be ambiguous).
 */
export function symbolPool(figs: readonly LearnFigure[]): LearnFigure[] {
  const cands = figs.map((f) => ({ f, c: emblemCandidates(f) }));
  const owners = new Map<string, Set<string>>();
  for (const { f, c } of cands)
    for (const e of c)
      for (const k of keyWords(e)) owners.set(k, (owners.get(k) ?? new Set()).add(f.slug));
  return cands.flatMap(({ f, c }) => {
    const e = c.find((t) => [...keyWords(t)].every((k) => owners.get(k)?.size === 1));
    return e ? [{ ...f, emblems: [e] }] : [];
  });
}

export type Lists = { balarama: LearnFigure[] | null; buddha: LearnFigure[] | null };
const LIST_BALARAMA = [
  'matsya',
  'kurma',
  'varaha',
  'narasimha',
  'vamana',
  'parashurama',
  'rama',
  'balarama',
  'krishna',
  'kalki',
];
const LIST_BUDDHA = [
  'matsya',
  'kurma',
  'varaha',
  'narasimha',
  'vamana',
  'parashurama',
  'rama',
  'krishna',
  'gautama-buddha',
  'kalki',
];
export const AVATAR_SLUGS = [...new Set([...LIST_BALARAMA, ...LIST_BUDDHA])];
/** The two common Dashavatara lists (Wikipedia: Dashavatara); a list is null when a figure is missing. */
export function avatarLists(figs: readonly LearnFigure[]): Lists {
  const by = new Map(figs.map((f) => [f.slug, f]));
  const build = (slugs: string[]) => {
    const out = slugs.map((x) => by.get(x));
    return out.every(Boolean) ? (out as LearnFigure[]) : null;
  };
  return { balarama: build(LIST_BALARAMA), buddha: build(LIST_BUDDHA) };
}

export const LIST_NAMES = { balarama: 'Balarama list', buddha: 'Buddha list' } as const;
/** The ten spokes: each position holds the one or two figures the common lists put there. */
export function avatarSpokes(l: Lists): LearnFigure[][] {
  const lists = [l.balarama, l.buddha].filter((x): x is LearnFigure[] => !!x);
  return Array.from({ length: 10 }, (_, i) => {
    const seen = new Set<string>();
    return lists.flatMap((li) => {
      const f = li[i] as LearnFigure;
      if (seen.has(f.slug)) return [];
      seen.add(f.slug);
      return [f];
    });
  });
}
/** Which lists the placed slugs are still a prefix of (never says "wrong": either list is fine). */
export function listsMatching(l: Lists, placed: readonly string[]): (keyof Lists)[] {
  return (['balarama', 'buddha'] as const).filter((k) => {
    const li = l[k];
    return !!li && placed.every((s, i) => li[i]?.slug === s);
  });
}

/** Which games have enough figures to play (the rest show a calm "more figures arriving" note). */
export function availability(figs: readonly LearnFigure[]): Record<string, boolean> {
  const l = avatarLists(figs);
  return {
    symbols: new Set(symbolPool(figs).map((f) => f.emblems[0]?.toLowerCase())).size >= 5,
    wheel: !!(l.balarama || l.buddha),
    gurus: inGroup(figs, 'guru').length >= 3,
    tirthankaras: inGroup(figs, 'tirthankara').filter((f) => lanchhana(f)).length >= 4,
    garden: new Set(gardenFacts(figs).map((f) => f.slug)).size >= 4,
    whoami: figs.filter((f) => clueable(f).length >= 3).length >= 4,
  };
}

export interface MatchRound {
  names: { slug: string; name: string }[];
  emblems: { slug: string; text: string }[];
}
/** Up to `n` figures whose emblems share no key word; emblems come back shuffled. */
export function symbolRound(figs: readonly LearnFigure[], rnd: () => number, n = 5): MatchRound {
  const used = new Set<string>();
  const pick: LearnFigure[] = [];
  for (const f of shuffle(
    figs.filter((x) => x.emblems.length > 0),
    rnd,
  )) {
    const ks = keyWords(f.emblems[0] as string);
    if ([...ks].some((k) => used.has(k))) continue;
    for (const k of ks) used.add(k);
    pick.push(f);
    if (pick.length === n) break;
  }
  return {
    names: pick.map((f) => ({ slug: f.slug, name: f.name })),
    emblems: shuffle(
      pick.map((f) => ({ slug: f.slug, text: f.emblems[0] as string })),
      rnd,
    ),
  };
}

export interface NextRound {
  prompt: string;
  options: { slug: string; name: string }[];
  answer: string;
}
/** "Who came after X?" rounds over an ordered list (Gurus). */
export function nextRounds(ordered: readonly LearnFigure[], rnd: () => number, n = 5): NextRound[] {
  if (ordered.length < 3) return [];
  const idx = shuffle(
    ordered.slice(0, -1).map((_, i) => i),
    rnd,
  ).slice(0, n);
  return idx.map((i) => {
    const cur = ordered[i] as LearnFigure;
    const ans = ordered[i + 1] as LearnFigure;
    const others = shuffle(
      ordered.filter((f) => f.slug !== ans.slug && f.slug !== cur.slug),
      rnd,
    ).slice(0, 3);
    return {
      prompt: `Who came after ${cur.name}?`,
      options: shuffle([ans, ...others], rnd).map((f) => ({ slug: f.slug, name: f.name })),
      answer: ans.slug,
    };
  });
}

const SECT_S = /\((?:\u015a?[Ss]h?vet\u0101?mbara|Shvetambara|Svetambara)\)/i;
const SECT_D = /\(Digambara\)/i;
/** A Tirthankara's lanchhana: an emblem that says symbol/lanchhana/emblem, else the first emblem. */
export const lanchhana = (f: Pick<LearnFigure, 'emblems'>): string | undefined =>
  f.emblems.find((e) => /symbol|lanchh?ana|emblem/i.test(e)) ?? f.emblems[0];

/**
 * Display text for a lanchhana: notes like "(lanchana)" dropped, "Svetambara" normalised to
 * "Shvetambara", and both sect variants shown when the two lists differ.
 */
export function lanchhanaText(f: Pick<LearnFigure, 'emblems'>): string | undefined {
  const sect = (e: string) =>
    e
      .replace(/\bSvetambara\b|\u015avet\u0101mbara/g, 'Shvetambara')
      .replace(/\s*\((?!Shvetambara|Digambara)[^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const s = f.emblems.find((e) => SECT_S.test(e));
  const d = f.emblems.find((e) => SECT_D.test(e));
  const main = lanchhana(f);
  if (!main) return undefined;
  if (s && d && s !== d && !/ or /i.test(main)) return `${sect(s)} \u00b7 ${sect(d)}`;
  return sect(main);
}

export interface MemoryCard {
  id: string;
  pair: string;
  kind: 'name' | 'emblem';
  text: string;
}
export function memoryDeck(
  figs: readonly LearnFigure[],
  rnd: () => number,
  pairs = 6,
): MemoryCard[] {
  const used = new Set<string>();
  const pick: LearnFigure[] = [];
  for (const f of shuffle(
    figs.filter((x) => lanchhanaText(x)),
    rnd,
  )) {
    const ks = keyWords(lanchhanaText(f) as string);
    if ([...ks].some((k) => used.has(k))) continue;
    for (const k of ks) used.add(k);
    pick.push(f);
    if (pick.length === pairs) break;
  }
  return shuffle(
    pick.flatMap((f) => [
      { id: `${f.slug}-n`, pair: f.slug, kind: 'name' as const, text: f.name },
      {
        id: `${f.slug}-e`,
        pair: f.slug,
        kind: 'emblem' as const,
        text: lanchhanaText(f) as string,
      },
    ]),
    rnd,
  );
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Titles, honorifics and everyday words that are never masked, even when they sit in a name. */
export const NO_MASK = new Set(
  (
    'guru gurus buddha buddhas mata mataji bhai baba lord devi deva devas dev maharaja maharani raja rani ' +
    'sri shri swami saint sage rishi maharishi goddess god gods king queen prince princess bhagwan bhagavan ' +
    'sahib sahiba ji singh kaur das dass nath natha the and son daughter lady mother father brother sister ' +
    'fish eagle boar lion tiger bull swan mouse horse tortoise elephant serpent snake dwarf monkey bird cow ' +
    'owl deer goat bear lotus wheel flute bow mace conch sun moon fire water earth wind sky mountain river'
  ).split(' '),
);
const HERE = 'this figure';
const RE_CACHE = new Map<string, RegExp>();
/**
 * Hide a figure's own names from a clue so a riddle never gives itself away. Whole words only,
 * case-insensitive, on the name / aka / native strings and their capitalised tokens; titles and
 * everyday words (Guru, Buddha, Devi, fish, eagle...) are never masked. Derived forms leak too
 * (Dnyaneshwar -> Dnyaneshwari, Bhagiratha -> Bhagirathi), so a token of 5+ letters also masks any
 * word that shares its stem (the token minus up to 3 letters, never fewer than 5 letters).
 */
export function maskName(text: string, f: Pick<LearnFigure, 'name' | 'aka' | 'native'>): string {
  const whole = [f.name, ...f.aka, f.native ?? '']
    .map((n) => n.trim())
    .filter((n) => n.length >= 3);
  const tokens = [f.name, ...f.aka].flatMap((n) =>
    n
      .split(/[\s,/]+/)
      .filter((w) => /^\p{Lu}/u.test(w) && w.length >= 4 && !NO_MASK.has(w.toLowerCase())),
  );
  const exact = [
    ...new Set([...whole.filter((w) => !NO_MASK.has(w.toLowerCase())), ...tokens]),
  ].sort((a, b) => b.length - a.length);
  const stems = [
    ...new Set(
      tokens.filter((t) => t.length >= 5).map((t) => t.slice(0, Math.max(5, t.length - 3))),
    ),
  ].sort((a, b) => b.length - a.length);
  if (!exact.length) return text;
  const key = `${f.name}|${f.aka.join(',')}|${f.native ?? ''}`;
  let re = RE_CACHE.get(key);
  if (!re) {
    const L = '[\\p{L}\\p{M}]';
    const alts = [...exact.map(esc), ...stems.map((x) => `${esc(x)}${L}*`)].join('|');
    re = new RegExp(`(?<!${L})(?:${alts})(?:['\u2019]s)?(?!${L})`, 'giu');
    RE_CACHE.set(key, re);
  }
  return text.replace(re, HERE);
}

const GLUED =
  /this figure[\p{L}\p{M}\-\u2010-\u2015]|[\p{L}\p{M}\-\u2010-\u2015]this figure|this figure[\s,;:]*(?:(?:of|and|or|the|to)\s+)?this figure/iu;
/**
 * A clue for a riddle or garden question, or null when masking leaves it unreadable: three or more
 * masks, or a mask glued to letters / hyphens / another mask ("this figure-Dikpala").
 */
export function maskedClue(
  text: string,
  f: Pick<LearnFigure, 'name' | 'aka' | 'native'>,
): string | null {
  const out = maskName(text, f);
  const n = out.split(HERE).length - 1;
  if (n >= 3 || GLUED.test(out)) return null;
  if (n === 0) return out;
  return unreadable(out) ? null : out;
}

const L1 = '[\\p{L}\\p{M}]';
const STARTERS = new Set(
  (
    'in on at when then later after before during according many some most today once while because but and although as by for from if it its the this that these those ' +
    'both each over under with without since so yet still also here there now even often sometimes traditionally reportedly early born known'
  ).split(' '),
);
const TEXT_NAMES =
  /^(ramayana|mahabharata|mahabharat|puranas?|vedas?|upanishads?|gita|bhagavata|jataka|sutta|agamas?|granth|sahib|hindu|jain|sikh|buddhist|indian|sanskrit|tamil|kalpa|sutra)$/i;
const DANGLING =
  /(?:^|[^\p{L}])(baby|infant|child|boy|girl|young|little|god|goddess|lord|saint|sage|king|queen|prince|princess|hero|demon|guru|teacher|monk|rishi|sun|moon|avatar|deity|lady|mother|father|brother|sister|son|daughter)\s+this figure/iu;
const ART_GAP = new RegExp(`(?:^|[^\\p{L}])(?:the|a|an)\\s+(${L1}+)\\s+this figure`, 'iu');
const OK_GAP =
  /^(story|text|epic|legend|telling|version|end|beginning|battle|war|year|day|night|forest|city|village|temple|tradition|myth|tale|scene|episode|world|morning|evening|time|moment|house|name|word|title|epithet|form|role|symbol|festival|day|name)$/i;
const OPENER =
  /^(in (that|this|the|another|other|some|many|one) (telling|version|story|account)s?\b|another (version|telling|account)\b|in (some|many|other) (tellings|versions)\b)/i;

/** Heuristics for a masked clue that would read as gibberish to a child (see tests for examples). */
export function unreadable(out: string): string | null {
  if (OPENER.test(out.trim())) return 'opener';
  const before = out.match(new RegExp(`(\\p{Lu}${L1}*)\\s+this figure`, 'u'));
  if (before) {
    const w = before[1] as string;
    if (!STARTERS.has(w.toLowerCase()) && !TEXT_NAMES.test(w)) return 'capBefore';
  }
  const after = out.match(new RegExp(`this figure\\s+(\\p{Lu}${L1}*)`, 'u'));
  if (after && !TEXT_NAMES.test(after[1] as string)) return 'capAfter';
  if (DANGLING.test(out)) return 'dangling';
  const gap = out.match(ART_GAP);
  if (gap && !OK_GAP.test(gap[1] as string)) return 'articleGap';
  // A pronoun up front whose antecedent was the masked name leaves the child with no one to picture.
  const head = out.split(/\s+/).slice(0, 6).join(' ');
  if (/^(he|she|they|his|her|their|him|them)\b/i.test(out.trim()) && !head.includes(HERE))
    return 'pronoun';
  return null;
}

/** Facts of a figure that make a readable masked clue. */
const CLUE_CACHE = new WeakMap<object, LearnFigure['facts']>();
export const clueable = (f: Pick<LearnFigure, 'name' | 'aka' | 'native' | 'facts'>) => {
  let c = CLUE_CACHE.get(f);
  if (!c) {
    c = f.facts.filter((x) => maskedClue(x.text, f) !== null);
    CLUE_CACHE.set(f, c);
  }
  return c;
};

const tagOf = (group: string) => GROUP_TABLE.find((g) => g.id === group)?.label;
export interface Choice {
  slug: string;
  name: string;
  /** Short group tag ("Ramayana", "Bodhisattvas") so same-named figures can be told apart. */
  tag?: string;
}
const nameKey = (n: string) => n.trim().toLowerCase();

export interface Riddle {
  clues: string[];
  options: Choice[];
  answer: string;
}
export function riddles(figs: readonly LearnFigure[], rnd: () => number, n = 3): Riddle[] {
  const able = figs.filter((f) => clueable(f).length >= 3);
  const out: Riddle[] = [];
  const asked = new Set<string>();
  for (const f of shuffle(able, rnd)) {
    if (out.length === n) break;
    if (asked.has(nameKey(f.name))) continue;
    asked.add(nameKey(f.name));
    const clues = shuffle(clueable(f), rnd)
      .slice(0, 3)
      .map((x) => maskedClue(x.text, f) as string);
    const same = shuffle(
      able.filter((o) => o.slug !== f.slug && o.tradition === f.tradition),
      rnd,
    );
    const rest = shuffle(
      able.filter((o) => o.slug !== f.slug && o.tradition !== f.tradition),
      rnd,
    );
    const names = new Set([nameKey(f.name)]);
    const others: LearnFigure[] = [];
    for (const o of [...same, ...rest]) {
      if (names.has(nameKey(o.name))) continue; // never two figures with one name in a round
      names.add(nameKey(o.name));
      others.push(o);
      if (others.length === 3) break;
    }
    out.push({
      clues,
      options: shuffle([f, ...others], rnd).map((o) => ({
        slug: o.slug,
        name: o.name,
        tag: tagOf(o.group),
      })),
      answer: f.slug,
    });
  }
  return out;
}

export interface GardenFact {
  id: string;
  slug: string;
  who: string;
  aka: string[];
  native?: string;
  tradition: string;
  group?: string;
  text: string;
  source: string;
}
const textId = (t: string) => {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 33) ^ t.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
export function gardenFacts(figs: readonly LearnFigure[]): GardenFact[] {
  return figs.flatMap((f) =>
    clueable(f).map((x) => ({
      id: `${f.slug}#${textId(x.text)}`,
      slug: f.slug,
      who: f.name,
      aka: f.aka,
      native: f.native,
      tradition: f.tradition,
      group: f.group,
      text: x.text,
      source: x.source,
    })),
  );
}

export interface GardenQ {
  fact: GardenFact;
  masked: string;
  options: Choice[];
}
/** "Which figure is this fact about?" for one garden fact: four options, same tradition first. */
export function gardenQuestion(
  fact: GardenFact,
  all: readonly GardenFact[],
  rnd: () => number,
): GardenQ {
  const seen = new Set([fact.slug]);
  const names = new Set([nameKey(fact.who)]);
  const pool = shuffle(
    all.filter((x) => x.slug !== fact.slug),
    rnd,
  ).sort((a, b) => Number(b.tradition === fact.tradition) - Number(a.tradition === fact.tradition));
  const others: Choice[] = [];
  for (const o of pool) {
    if (seen.has(o.slug) || names.has(nameKey(o.who))) continue;
    seen.add(o.slug);
    names.add(nameKey(o.who));
    others.push({ slug: o.slug, name: o.who, tag: o.group ? tagOf(o.group) : undefined });
    if (others.length === 3) break;
  }
  return {
    fact,
    masked:
      maskedClue(fact.text, { name: fact.who, aka: fact.aka, native: fact.native }) ?? fact.text,
    options: shuffle(
      [
        { slug: fact.slug, name: fact.who, tag: fact.group ? tagOf(fact.group) : undefined },
        ...others,
      ],
      rnd,
    ),
  };
}

/** The four answers of a quiz item, shuffled with a seed from the item itself (SSR-stable). */
export function shuffleQuiz<T extends { q: string; options: readonly string[]; answer: number }>(
  item: T,
  index: number,
): { options: string[]; answer: number } {
  let h = 2166136261 ^ index;
  for (let i = 0; i < item.q.length; i++) h = Math.imul(h ^ item.q.charCodeAt(i), 16777619);
  const order = shuffle(
    item.options.map((_, i) => i),
    rng(h >>> 0),
  );
  return {
    options: order.map((i) => item.options[i] as string),
    answer: order.indexOf(item.answer),
  };
}

export const GAME_IDS = ['symbols', 'wheel', 'gurus', 'tirthankaras', 'garden', 'whoami'] as const;
export type GameId = (typeof GAME_IDS)[number];
export const isGameId = (x: string | null): x is GameId =>
  !!x && (GAME_IDS as readonly string[]).includes(x);
