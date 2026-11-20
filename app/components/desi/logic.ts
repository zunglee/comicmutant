/**
 * Pure helpers for the /desi hub (no React, no server imports) so they are unit-tested directly.
 * A hero with 0 facts and one with 30 both flow through every function here.
 */

export const MEDIUMS = ['comics', 'film', 'tv', 'animation', 'manga', 'game', 'novel'] as const;
const MEDIUM_NAMES: Record<string, string> = {
  comics: 'Comics',
  film: 'Film',
  tv: 'TV',
  animation: 'Animation',
  manga: 'Manga',
  game: 'Games',
  novel: 'Novels',
};

/** Own-key lookup: data and URL values like 'constructor' must never hit Object.prototype. */
export const mediumLabel = (m: string) =>
  Object.hasOwn(MEDIUM_NAMES, m) ? (MEDIUM_NAMES[m] as string) : m;

export const SORTS = { hot: 'Hot', az: 'A–Z', old: 'Oldest first' } as const;
export type DesiSort = keyof typeof SORTS;

/** Known Indian comic houses. Anything else falls back to its medium (Film, TV, Animation…). */
const HOUSES: [RegExp, string][] = [
  [/raj\s*comics/i, 'Raj Comics'],
  [/diamond/i, 'Diamond Comics'],
  [/indrajal/i, 'Indrajal Comics'],
  [/tulsi/i, 'Tulsi Comics'],
  [/manoj/i, 'Manoj Comics'],
  [/fort\s*comics/i, 'Fort Comics'],
  [/pran/i, "Pran's"],
  [/amar\s*chitra/i, 'Amar Chitra Katha'],
  [/holy\s*cow/i, 'Holy Cow'],
  [/graphic\s*india/i, 'Graphic India'],
  [/yali/i, 'Yali Dream Creations'],
];
const MEDIUM_GROUP: Record<string, string> = {
  film: 'Film',
  tv: 'TV',
  animation: 'Animation',
  manga: 'Manga',
  game: 'Games',
  novel: 'Novels',
};

export function publisherGroup(publisher: string, medium: string): string {
  for (const [re, name] of HOUSES) if (re.test(publisher)) return name;
  if (medium !== 'comics')
    return Object.hasOwn(MEDIUM_GROUP, medium) ? (MEDIUM_GROUP[medium] as string) : 'Other';
  return publisher.replace(/\s*\(.*\)\s*$/, '').trim() || 'Other';
}

export const decadeOf = (year: number) => Math.floor(year / 10) * 10;

export interface DesiCardData {
  slug: string;
  name: string;
  kind: string;
  summary: string;
  palette: { c1: string; c2: string; c3: string };
  motif: string;
  heat: number;
  year: number;
  publisher: string;
  group: string;
  medium: string;
  factCount: number;
  creators: string[];
  /** Lower-cased search haystack (name, alter ego, teams). */
  hay: string;
}

export interface DesiFilter {
  q: string;
  group: string;
  medium: string;
  era: string;
  kind: string;
  sort: DesiSort;
  /** A–Z jump: first letter of the name ('' = all). */
  letter: string;
}
export type DesiView = 'grid' | 'table';
export const NO_FILTER: DesiFilter = {
  q: '',
  group: '',
  medium: '',
  era: '',
  kind: '',
  sort: 'hot',
  letter: '',
};

export function filterHeroes(list: readonly DesiCardData[], f: DesiFilter): DesiCardData[] {
  const q = f.q.trim().toLowerCase();
  const out = list.filter(
    (c) =>
      (!q || c.hay.includes(q)) &&
      (!f.group || c.group === f.group) &&
      (!f.medium || c.medium === f.medium) &&
      (!f.era || String(decadeOf(c.year)) === f.era) &&
      (!f.kind || c.kind === f.kind) &&
      (!f.letter || firstLetter(c.name) === f.letter),
  );
  return out.sort((a, b) =>
    f.sort === 'az'
      ? a.name.localeCompare(b.name)
      : f.sort === 'old'
        ? a.year - b.year || a.name.localeCompare(b.name)
        : b.heat - a.heat || a.name.localeCompare(b.name),
  );
}

export interface Facet {
  value: string;
  count: number;
}

/** Counts per publisher group, biggest shelf first. */
export function groupFacets(list: readonly DesiCardData[]): Facet[] {
  const m = new Map<string, number>();
  for (const c of list) m.set(c.group, (m.get(c.group) ?? 0) + 1);
  return [...m]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export interface DecadeBucket {
  decade: number;
  heroes: DesiCardData[];
}

/** Debut decades from the first to the last with a hero, empty decades included so gaps show. */
export function decadeBuckets(list: readonly DesiCardData[]): DecadeBucket[] {
  if (list.length === 0) return [];
  const years = list.map((c) => decadeOf(c.year));
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  const out: DecadeBucket[] = [];
  for (let d = lo; d <= hi; d += 10) {
    out.push({
      decade: d,
      heroes: list
        .filter((c) => decadeOf(c.year) === d)
        .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name)),
    });
  }
  return out;
}

/** Small deterministic PRNG so the day's picks are stable between server and client. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rnd = seeded(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export const dayNumber = (ms: number) => Math.floor(ms / 86_400_000);

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Index letter of a name: A–Z, or '#' for digits and symbols. */
export function firstLetter(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

/** Letters that have at least one hero, in order. */
export function lettersPresent(list: readonly DesiCardData[]): Set<string> {
  return new Set(list.map((c) => firstLetter(c.name)));
}

const PARAM: Record<keyof DesiFilter, string> = {
  q: 'q',
  group: 'pub',
  medium: 'm',
  era: 'era',
  kind: 'k',
  sort: 'sort',
  letter: 'l',
};

/** URL -> filter + view. Unknown values fall back to "no filter", so a stale link still renders. */
export function parseFilter(sp: URLSearchParams): { f: DesiFilter; view: DesiView } {
  const get = (k: keyof DesiFilter) => sp.get(PARAM[k]) ?? '';
  const sort = get('sort');
  const letter = get('letter').toUpperCase();
  return {
    f: {
      q: get('q').slice(0, 40),
      group: get('group').slice(0, 60),
      medium: (MEDIUMS as readonly string[]).includes(get('medium')) ? get('medium') : '',
      era: /^\d{4}$/.test(get('era')) ? get('era') : '',
      kind: ['hero', 'villain', 'antihero'].includes(get('kind')) ? get('kind') : '',
      sort: Object.hasOwn(SORTS, sort) ? (sort as DesiSort) : 'hot',
      letter: /^[A-Z#]$/.test(letter) ? letter : '',
    },
    view: sp.get('view') === 'table' ? 'table' : 'grid',
  };
}

/** Filter + view -> URL params (defaults omitted so the clean URL is /desi). */
export function filterToParams(f: DesiFilter, view: DesiView): URLSearchParams {
  const sp = new URLSearchParams();
  for (const k of Object.keys(PARAM) as (keyof DesiFilter)[]) {
    if (f[k] && f[k] !== NO_FILTER[k]) sp.set(PARAM[k], f[k]);
  }
  if (view === 'table') sp.set('view', 'table');
  return sp;
}

/** Each hero's card art: the clip kind follows the theme motif, and a slug hash splits ties. */
const ART: Record<string, [string, string]> = {
  tech: ['kaleido', 'glitch'],
  bolt: ['charge', 'speedlines'],
  flame: ['blast', 'impact'],
  ice: ['kaleido', 'orbit'],
  cosmic: ['orbit', 'portal'],
  magic: ['portal', 'sticker'],
  shadow: ['spotlight', 'skyline-run'],
  speed: ['speedlines', 'skyline-run'],
  strength: ['impact', 'cover'],
  nature: ['storm', 'orbit'],
  web: ['cardflip', 'faceoff'],
  claw: ['impact', 'headline'],
  mind: ['portal', 'glitch'],
  water: ['storm', 'orbit'],
  chaos: ['glitch', 'sticker'],
  size: ['cover', 'cardflip'],
};
export function artKind(motif: string, slug: string): string {
  const pair = Object.hasOwn(ART, motif) ? (ART[motif] as [string, string]) : ['splash', 'cover'];
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pair[h % 2] as string;
}

/** "Show more" count from ?n=: a multiple of the page size, capped by the list. */
export function parseCount(sp: URLSearchParams, page: number, max: number): number {
  const n = Number(sp.get('n'));
  if (!Number.isInteger(n) || n < page) return page;
  return Math.min(Math.ceil(n / page) * page, Math.max(page, Math.ceil(max / page) * page));
}
