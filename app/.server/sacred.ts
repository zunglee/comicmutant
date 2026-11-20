/**
 * Sacred India content store. Figure JSON (content/sacred/<tradition>/<slug>.json) is bundled into
 * the server build and validated once; content/sacred/roster.json lists every figure that WILL have
 * a profile, so a roster slug without a file yet shows as a "coming soon" card. The pages work with
 * 0 to 377 files. Same load rule as content.ts: a broken file is skipped in dev, fatal in production.
 */
import { z } from 'zod';

import type { SacredCardData } from '~/components/sacred/types';
import { TRADITION_LOOK } from '~/components/sacred/types';
import { Figure, GROUP_TABLE, SACRED_GROUPS, TRADITIONS } from '~/lib/sacred-schema';

export const RosterRow = z.object({
  slug: z.string(),
  name: z.string(),
  tradition: z.enum(TRADITIONS),
  group: z.enum(SACRED_GROUPS),
});
export type RosterRow = z.infer<typeof RosterRow>;

/** Cards carry a short preview of a fact (the card clamps the text anyway); the profile has it all. */
function clip(t: string, n: number) {
  if (t.length <= n) return t;
  return `${t.slice(0, n).replace(/\s+\S*$/, '')}\u2026`;
}

/** Top three facts by interest, shorter first on a tie so the back of a card stays readable. */
export function topFacts(f: Figure, n = 3) {
  return [...f.facts]
    .sort((a, b) => b.interest - a.interest || a.text.length - b.text.length)
    .slice(0, n)
    .map(({ text, kind, interest }) => ({ text, kind, interest }));
}

export function toCard(f: Figure): SacredCardData {
  return {
    slug: f.slug,
    name: f.name,
    native: f.native,
    tradition: f.tradition,
    group: f.group,
    role: f.role,
    symbol: f.symbol,
    palette: f.palette,
    ready: true,
    facts: topFacts(f).map(({ text }) => ({ text: clip(text, 130) })),
  };
}

export function pendingCard(r: RosterRow): SacredCardData {
  const look = TRADITION_LOOK[r.tradition];
  return {
    slug: r.slug,
    name: r.name,
    tradition: r.tradition,
    group: r.group,
    role: 'Profile coming soon',
    symbol: look.symbol,
    palette: { c1: look.c1, c2: look.c2 },
    ready: false,
    facts: [],
  };
}

export interface SacredStore {
  allFigures: Figure[];
  roster: RosterRow[];
  getFigure(slug: string): Figure | undefined;
  getRow(slug: string): RosterRow | undefined;
  /** Every roster row as a card (ready ones carry their profile), in roster order. */
  rosterCards(): SacredCardData[];
  figuresBy(filter: { tradition?: string; group?: string }): Figure[];
  cardsBy(filter: { tradition?: string; group?: string }): SacredCardData[];
  search(q: string, limit?: number): SacredCardData[];
  figureOfTheDay(date?: Date): SacredCardData | null;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Year ranges written with a hyphen (1469-1539) render with an en dash. URLs are left alone. */
export function tidyText(v: string): string {
  return v.startsWith('https://') ? v : v.replace(/(\d{3,4})\s?-\s?(\d{2,4})(?!\d)/g, '$1\u2013$2');
}
function tidy<T>(v: T): T {
  if (typeof v === 'string') return tidyText(v) as T;
  if (Array.isArray(v)) return v.map(tidy) as T;
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tidy(x)])) as T;
  return v;
}

export function buildStore(rawFigures: Figure[], rosterIn: RosterRow[]): SacredStore {
  const figuresIn = rawFigures.map(tidy);
  const figures = new Map(figuresIn.map((f) => [f.slug, f]));
  const rowSlugs = new Set(rosterIn.map((r) => r.slug));
  // Files not yet on the roster still show (appended), so research can land ahead of the roster.
  const roster: RosterRow[] = [
    ...rosterIn,
    ...figuresIn
      .filter((f) => !rowSlugs.has(f.slug))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((f) => ({ slug: f.slug, name: f.name, tradition: f.tradition, group: f.group })),
  ];
  const rows = new Map(roster.map((r) => [r.slug, r]));
  const cardOf = (r: RosterRow): SacredCardData => {
    const f = figures.get(r.slug);
    return f ? toCard(f) : pendingCard(r);
  };
  const match = (
    x: { tradition: string; group: string },
    flt: { tradition?: string; group?: string },
  ) => (!flt.tradition || x.tradition === flt.tradition) && (!flt.group || x.group === flt.group);
  const allFigures = roster.flatMap((r) => {
    const f = figures.get(r.slug);
    return f ? [f] : [];
  });
  return {
    allFigures,
    roster,
    getFigure: (slug) => figures.get(slug),
    getRow: (slug) => rows.get(slug),
    rosterCards: () => roster.map(cardOf),
    figuresBy: (flt) => allFigures.filter((f) => match(f, flt)),
    cardsBy: (flt) => roster.filter((r) => match(r, flt)).map(cardOf),
    search(q, limit = 24) {
      const needle = fold(q);
      if (needle.length < 2) return [];
      const hits: { r: RosterRow; score: number }[] = [];
      for (const r of roster) {
        const f = figures.get(r.slug);
        const names = [r.name, ...(f?.aka ?? [])].map(fold);
        const exact = names.some((n) => n === needle);
        const start = names.some((n) => n.startsWith(needle));
        const has = names.some((n) => n.includes(needle)) || fold(f?.native ?? '').includes(needle);
        if (exact || start || has) hits.push({ r, score: exact ? 0 : start ? 1 : 2 });
      }
      return hits
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map((h) => cardOf(h.r));
    },
    figureOfTheDay(date = new Date()) {
      if (allFigures.length === 0) return null;
      const day = Math.floor(date.getTime() / 86_400_000);
      // biome-ignore lint/style/noNonNullAssertion: modulo of a non-empty list.
      return toCard(allFigures[day % allFigures.length]!);
    },
  };
}

// ── bundled content ───────────────────────────────────────────────────────────────────

const figureFiles = import.meta.glob('/content/sacred/*/*.json', {
  eager: true,
  import: 'default',
});
const rosterFile = import.meta.glob('/content/sacred/roster.json', {
  eager: true,
  import: 'default',
});

function load<T>(files: Record<string, unknown>, parse: (v: unknown) => T, label: string): T[] {
  const out: T[] = [];
  for (const [file, raw] of Object.entries(files)) {
    try {
      out.push(parse(raw));
    } catch (e) {
      if (process.env.NODE_ENV === 'production') throw new Error(`${label} ${file}: ${e}`);
      const n = (e as { issues?: unknown[] }).issues?.length ?? 1;
      console.warn(
        `[sacred] skipped ${file} (${n} issue${n === 1 ? '' : 's'}; run validate-sacred)`,
      );
    }
  }
  return out;
}

const store = buildStore(
  load(figureFiles, (v) => Figure.parse(v), 'figure'),
  Object.values(rosterFile).flatMap((v) => z.array(RosterRow).parse(v)),
);

export const allFigures = store.allFigures;
export const sacredRoster = store.roster;
export const getFigure = store.getFigure;
export const getRosterRow = store.getRow;
export const rosterCards = store.rosterCards;
export const figuresBy = store.figuresBy;
export const cardsBy = store.cardsBy;
export const searchFigures = store.search;
export const figureOfTheDay = store.figureOfTheDay;
export const groupsOf = (tradition: string) => GROUP_TABLE.filter((g) => g.tradition === tradition);
