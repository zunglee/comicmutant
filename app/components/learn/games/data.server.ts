/**
 * Server-only loader for the Learning Garden. Figures come from `~/.server/sacred`; the hub gets only
 * availability flags and each game gets its own slim data when it opens (never all 373 figures). `?fixture=1` (dev, or COMICMUTANT_LAB=1 as in
 * e2e) reads test/fixtures/learn-figures.json instead, with the same slimming.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { allFigures } from '~/.server/sacred';
import type { GameId } from './logic';
import {
  AVATAR_SLUGS,
  availability,
  clueable,
  inGroup,
  lanchhanaText,
  shuffle,
  symbolPool,
  yearsOf,
} from './logic';
import type { LearnFigure } from './types';

type Src = {
  slug: string;
  name: string;
  aka?: string[];
  native?: string;
  tradition: string;
  group: string;
  order?: number;
  role: string;
  symbol?: string;
  emblems?: string[];
  kidSummary?: string;
  years?: string;
  palette?: { c1: string; c2: string };
  facts?: { text: string; kind: string; source: string; interest: number; kid?: boolean }[];
};

function slim(f: Src): LearnFigure {
  const facts = (f.facts ?? []).map((x) => ({ ...x, kid: x.kid ?? false }));
  const kid = facts.filter((x) => x.kid).sort((a, b) => b.interest - a.interest);
  const pool = kid.length >= 3 ? kid : [...facts].sort((a, b) => b.interest - a.interest);
  return {
    slug: f.slug,
    name: f.name,
    native: f.native,
    aka: f.aka ?? [],
    tradition: f.tradition,
    group: f.group,
    order: f.order ?? 500,
    role: f.role,
    emblems: f.emblems ?? [],
    symbol: f.symbol ?? 'lotus',
    palette: f.palette ?? { c1: '#fde8c8', c2: '#9a4a07' },
    kidSummary: f.kidSummary,
    years: f.years,
    facts: pool.slice(0, 8),
  };
}

function everyone(fixture: boolean): LearnFigure[] {
  if (fixture && (import.meta.env.DEV || process.env.COMICMUTANT_LAB === '1')) {
    try {
      const fx = JSON.parse(
        readFileSync(path.resolve('test/fixtures/learn-figures.json'), 'utf8'),
      ) as Src[];
      return fx.map(slim);
    } catch {
      return [];
    }
  }
  return allFigures.map((f) => slim(f as Src));
}

/** The hub only needs to know which games can open: booleans, no figure data. */
export function learnAvailability(opts: { fixture?: boolean } = {}): Record<GameId, boolean> {
  return availability(everyone(!!opts.fixture)) as Record<GameId, boolean>;
}

const bare = (f: LearnFigure, keep: Partial<LearnFigure>): LearnFigure => ({
  slug: f.slug,
  name: f.name,
  aka: [],
  tradition: f.tradition,
  group: f.group,
  order: f.order,
  role: f.role,
  emblems: [],
  symbol: f.symbol,
  palette: f.palette,
  facts: [],
  ...keep,
});
const sample = <T>(xs: T[], n: number): T[] => shuffle(xs, Math.random).slice(0, n);

/** Only what one game needs, loaded when that game opens (keeps /sacred/learn light). */
export function gameFigures(game: GameId, opts: { fixture?: boolean } = {}): LearnFigure[] {
  const all = everyone(!!opts.fixture);
  switch (game) {
    case 'symbols':
      return symbolPool(all).map((f) => bare(f, { emblems: f.emblems }));
    case 'wheel':
      return all
        .filter((f) => AVATAR_SLUGS.includes(f.slug))
        .map((f) =>
          bare(f, {
            native: f.native,
            kidSummary: f.kidSummary,
            emblems: f.emblems.slice(0, 3),
            facts: f.facts.slice(0, 1),
          }),
        );
    case 'gurus':
      return inGroup(all, 'guru').map((f) =>
        bare(f, { kidSummary: f.kidSummary, years: yearsOf(f) }),
      );
    case 'tirthankaras':
      return inGroup(all, 'tirthankara').map((f) => {
        const t = lanchhanaText(f);
        return bare(f, { emblems: t ? [t] : [] });
      });
    case 'garden':
      return sample(
        all.filter((f) => clueable(f).length > 0),
        40,
      ).map((f) => bare(f, { aka: f.aka, native: f.native, facts: sample(clueable(f), 2) }));
    case 'whoami':
      return sample(
        all.filter((f) => clueable(f).length >= 3),
        36,
      ).map((f) => bare(f, { aka: f.aka, native: f.native, facts: clueable(f).slice(0, 5) }));
  }
}
