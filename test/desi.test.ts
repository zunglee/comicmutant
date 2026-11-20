import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  artKind,
  type DesiCardData,
  decadeBuckets,
  filterHeroes,
  filterToParams,
  firstLetter,
  groupFacets,
  lettersPresent,
  NO_FILTER,
  parseCount,
  parseFilter,
  publisherGroup,
  seededShuffle,
} from '~/components/desi/logic';
import { Character } from '~/lib/schema';

const dir = 'content/characters/indian';
const heroes: DesiCardData[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  // Files still being researched may not validate yet; content.test.ts is the gate for those.
  .map((f) => Character.safeParse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))))
  .flatMap((r) => (r.success ? [r.data] : []))
  .map((c) => ({
    slug: c.slug,
    name: c.name,
    kind: c.kind,
    summary: c.summary,
    palette: c.theme.palette,
    motif: c.theme.motif,
    heat: c.heat,
    year: c.firstAppearance.year,
    publisher: c.publisher,
    group: publisherGroup(c.publisher, c.medium),
    medium: c.medium,
    factCount: c.facts?.length ?? 0,
    creators: c.creators,
    hay: [c.name, c.realName ?? '', ...c.affiliations].join(' ').toLowerCase(),
  }));

describe('desi logic', () => {
  it('groups publishers into houses and media', () => {
    expect(publisherGroup('Raj Comics', 'comics')).toBe('Raj Comics');
    expect(publisherGroup('Diamond Comics Pvt Ltd', 'comics')).toBe('Diamond Comics');
    expect(publisherGroup('Red Chillies Entertainment', 'film')).toBe('Film');
    expect(publisherGroup('DD National (Doordarshan)', 'tv')).toBe('TV');
  });

  it('has Indian heroes to work with', () => {
    expect(heroes.length).toBeGreaterThanOrEqual(20);
  });

  it('filters narrow the list and never widen it', () => {
    const all = filterHeroes(heroes, NO_FILTER);
    expect(all).toHaveLength(heroes.length);
    const raj = filterHeroes(heroes, { ...NO_FILTER, group: 'Raj Comics' });
    expect(raj.length).toBeGreaterThan(0);
    expect(raj.length).toBeLessThan(all.length);
    expect(raj.every((h) => h.group === 'Raj Comics')).toBe(true);
    const both = filterHeroes(heroes, { ...NO_FILTER, group: 'Raj Comics', kind: 'hero' });
    expect(both.length).toBeLessThanOrEqual(raj.length);
    expect(filterHeroes(heroes, { ...NO_FILTER, q: 'zzzz-nobody' })).toEqual([]);
    const era = filterHeroes(heroes, { ...NO_FILTER, era: '1980' });
    expect(era.every((h) => h.year >= 1980 && h.year < 1990)).toBe(true);
  });

  it('sorts A-Z, oldest and hot', () => {
    const az = filterHeroes(heroes, { ...NO_FILTER, sort: 'az' }).map((h) => h.name);
    expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b)));
    const old = filterHeroes(heroes, { ...NO_FILTER, sort: 'old' }).map((h) => h.year);
    expect(old).toEqual([...old].sort((a, b) => a - b));
    const hot = filterHeroes(heroes, { ...NO_FILTER, sort: 'hot' }).map((h) => h.heat);
    expect(hot).toEqual([...hot].sort((a, b) => b - a));
  });

  it('builds a gap-free decade timeline that accounts for every hero', () => {
    const b = decadeBuckets(heroes);
    expect(b.reduce((n, x) => n + x.heroes.length, 0)).toBe(heroes.length);
    for (let i = 1; i < b.length; i++) expect(b[i]?.decade).toBe((b[i - 1]?.decade ?? 0) + 10);
    expect(decadeBuckets([])).toEqual([]);
  });

  it('facets count every hero once', () => {
    expect(groupFacets(heroes).reduce((n, f) => n + f.count, 0)).toBe(heroes.length);
  });

  it('shuffles deterministically per seed without losing items', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 42);
    expect(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 42)).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('round-trips filters through the URL and ignores junk', () => {
    const f = { ...NO_FILTER, group: 'Raj Comics', era: '1980', sort: 'az' as const, letter: 'N' };
    const back = parseFilter(filterToParams(f, 'table'));
    expect(back.f).toEqual(f);
    expect(back.view).toBe('table');
    expect(filterToParams(NO_FILTER, 'grid').toString()).toBe('');
    const junk = parseFilter(new URLSearchParams('m=bogus&era=x&sort=zzz&l=9&k=god&view=x'));
    expect(junk.f).toEqual(NO_FILTER);
    expect(junk.view).toBe('grid');
  });

  it('rejects prototype keys from the URL', () => {
    const bad = parseFilter(new URLSearchParams('sort=constructor&m=__proto__&k=toString'));
    expect(bad.f.sort).toBe('hot');
    expect(bad.f.medium).toBe('');
    expect(parseFilter(new URLSearchParams('sort=__proto__')).f.sort).toBe('hot');
    expect(artKind('constructor', 'x')).toMatch(/^(splash|cover)$/);
    expect(publisherGroup('x', 'constructor')).toBe('Other');
  });

  it('?n= keeps the Show more count, clamped to the list', () => {
    expect(parseCount(new URLSearchParams('n=48'), 24, 100)).toBe(48);
    expect(parseCount(new URLSearchParams('n=50'), 24, 100)).toBe(72);
    expect(parseCount(new URLSearchParams('n=9999'), 24, 60)).toBe(72);
    expect(parseCount(new URLSearchParams('n=abc'), 24, 60)).toBe(24);
    expect(parseCount(new URLSearchParams(''), 24, 10)).toBe(24);
  });

  it('letter filter and index follow the data', () => {
    const l = lettersPresent(heroes);
    for (const h of heroes) expect(l.has(firstLetter(h.name))).toBe(true);
    const some = [...l][0] as string;
    const got = filterHeroes(heroes, { ...NO_FILTER, letter: some });
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((h) => firstLetter(h.name) === some)).toBe(true);
  });

  it('card art varies across heroes and never uses a dropped clip', () => {
    const kinds = new Set(heroes.map((h) => artKind(h.motif, h.slug)));
    expect(kinds.size).toBeGreaterThan(3);
    const dropped = ['aura', 'wipe', 'panels', 'rain', 'shockwave', 'heartbeat', 'radar'];
    for (const h of heroes) expect(dropped).not.toContain(artKind(h.motif, h.slug));
  });

  it('copes with heroes that have 0 facts', () => {
    expect(heroes.some((h) => h.factCount === 0) || heroes.every((h) => h.factCount > 0)).toBe(
      true,
    );
    expect(() =>
      filterHeroes(
        heroes.map((h) => ({ ...h, factCount: 0 })),
        NO_FILTER,
      ),
    ).not.toThrow();
  });
});
