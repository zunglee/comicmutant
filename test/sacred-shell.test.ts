import { describe, expect, it } from 'vitest';
import { buildStore, pendingCard, type RosterRow, toCard, topFacts } from '~/.server/sacred';
import { isSacredPath } from '~/components/sacred/realm';
import { MOTIFS } from '~/components/sacred/symbol-art';
import { Figure, SACRED_SYMBOLS } from '~/lib/sacred-schema';
import fixture from './fixtures/sacred-figure.json';

const fig = Figure.parse(fixture);
const roster: RosterRow[] = [
  { slug: 'ganesha', name: 'Ganesha', tradition: 'hindu', group: 'deva' },
  { slug: fig.slug, name: fig.name, tradition: fig.tradition, group: fig.group },
  { slug: 'nanak', name: 'Guru Nanak', tradition: 'sikh', group: 'guru' },
];

describe('sacred store', () => {
  const store = buildStore([fig], roster);
  it('works with a file for only some roster rows', () => {
    const cards = store.rosterCards();
    expect(cards.map((c) => c.slug)).toEqual(['ganesha', fig.slug, 'nanak']);
    expect(cards.map((c) => c.ready)).toEqual([false, true, false]);
    expect(cards[0]?.role).toBe('Profile coming soon');
  });
  it('works with zero files', () => {
    const empty = buildStore([], roster);
    expect(empty.allFigures).toHaveLength(0);
    expect(empty.figureOfTheDay()).toBeNull();
    expect(empty.rosterCards().every((c) => !c.ready)).toBe(true);
  });
  it('keeps roster order and appends files not yet on the roster', () => {
    const s = buildStore([fig], []);
    expect(s.roster.map((r) => r.slug)).toEqual([fig.slug]);
  });
  it('filters by tradition and group', () => {
    expect(store.cardsBy({ tradition: 'hindu' })).toHaveLength(2);
    expect(store.cardsBy({ tradition: 'sikh', group: 'guru' })).toHaveLength(1);
    expect(store.figuresBy({ tradition: 'sikh' })).toHaveLength(0);
  });
  it('searches names and aka, ignoring case and accents, and needs 2 letters', () => {
    expect(store.search('nan').map((c) => c.slug)).toEqual(['nanak']);
    expect(store.search(fig.aka[0] ?? 'zzz').map((c) => c.slug)).toContain(fig.slug);
    expect(store.search('g')).toEqual([]);
    expect(store.search('GANGA')[0]?.slug).toBe(fig.slug);
  });
  it('figure of the day is stable within a day', () => {
    const d = new Date('2026-11-13T05:00:00Z');
    expect(store.figureOfTheDay(d)?.slug).toBe(fig.slug);
  });
});

describe('cards', () => {
  it('back of the card = the 3 most interesting facts', () => {
    const top = topFacts(fig);
    expect(top).toHaveLength(3);
    const min = Math.min(...top.map((f) => f.interest));
    expect(fig.facts.filter((f) => f.interest > min).length).toBeLessThanOrEqual(3);
    toCard(fig).facts.forEach((f, i) => {
      expect(top[i]?.text.startsWith(f.text.replace(/\u2026$/, ''))).toBe(true);
      expect(f.text.length).toBeLessThanOrEqual(131);
    });
  });
  it('a pending card shows no facts and uses a tradition colour', () => {
    const c = pendingCard(roster[0] as RosterRow);
    expect(c.facts).toEqual([]);
    // A token mix of the sacred skin (var(--c1) ...) or a hex.
    expect(c.palette.c1).toMatch(/^(#|var\(--|color-mix\()/);
  });
});

describe('symbol art', () => {
  it('has strokes for every SACRED_SYMBOLS motif', () => {
    for (const s of SACRED_SYMBOLS) expect(MOTIFS[s]?.length, s).toBeGreaterThan(0);
    expect(Object.keys(MOTIFS).sort()).toEqual([...SACRED_SYMBOLS].sort());
  });
});

describe('realm', () => {
  it('is only /sacred and below', () => {
    expect(isSacredPath('/sacred')).toBe(true);
    expect(isSacredPath('/sacred/f/ganga')).toBe(true);
    expect(isSacredPath('/')).toBe(false);
    expect(isSacredPath('/sacredx')).toBe(false);
  });
});
