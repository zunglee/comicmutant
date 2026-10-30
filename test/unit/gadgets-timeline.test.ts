import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLUEPRINT_SLOTS } from '~/components/gadgets';
import { Gadget } from '~/lib/schema';

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const chars = walk('content/characters').map(read);
const roster = new Set(chars.map((c) => c.slug));
const gadgets = walk('content/gadgets').map((f) => ({ f, raw: read(f) }));

describe('gadget lab', () => {
  it('has gadgets', () => expect(gadgets.length).toBeGreaterThanOrEqual(8));
  it.each(gadgets.map((g) => [g.f, g.raw]))('%s is valid and fits its blueprint', (f, raw) => {
    const g = Gadget.parse(raw);
    expect(g.slug).toBe(path.basename(String(f), '.json'));
    expect(roster.has(g.owner), `owner ${g.owner}`).toBe(true);
    expect(g.parts).toHaveLength(BLUEPRINT_SLOTS[g.blueprint].length);
  });
});

describe('timeline', () => {
  it('milestones are oldest first, start at or after the debut, and link to real characters', () => {
    for (const c of chars) {
      const t: { year: number; with?: string }[] = c.timeline ?? [];
      for (let i = 1; i < t.length; i++)
        expect(t[i]?.year, `${c.slug} order`).toBeGreaterThanOrEqual(t[i - 1]?.year ?? 0);
      if (t[0]) expect(t[0].year, `${c.slug} debut`).toBeGreaterThanOrEqual(c.firstAppearance.year);
      for (const m of t) if (m.with) expect(roster.has(m.with), `${c.slug} → ${m.with}`).toBe(true);
    }
  });
});
