import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character, Fighter } from '~/lib/schema';

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const chars = walk('content/characters').map((f) => ({ f, raw: read(f) }));
const fighters = walk('content/fighters').map((f) => ({ f, raw: read(f) }));

describe('content', () => {
  it.each(chars.map((c) => [c.f, c.raw]))('%s is a valid Character', (_f, raw) => {
    expect(() => Character.parse(raw)).not.toThrow();
  });
  it.each(fighters.map((c) => [c.f, c.raw]))('%s is a valid Fighter', (_f, raw) => {
    expect(() => Fighter.parse(raw)).not.toThrow();
  });
  it('slugs are unique across characters and originals, and match file names', () => {
    const all = [...chars, ...fighters];
    const slugs = all.map((x) => x.raw.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const x of all) expect(x.raw.slug).toBe(path.basename(x.f, '.json'));
  });
  it('rivals/allies resolve within their own cast', () => {
    const cs = new Set(chars.map((c) => c.raw.slug));
    const fs = new Set(fighters.map((c) => c.raw.slug));
    for (const c of chars)
      for (const s of [...(c.raw.rivals ?? []), ...(c.raw.allies ?? [])])
        expect(cs.has(s), `${c.f} → ${s}`).toBe(true);
    for (const c of fighters)
      for (const s of c.raw.rivals ?? []) expect(fs.has(s), `${c.f} → ${s}`).toBe(true);
  });
  it('quiz answers are distinct options', () => {
    for (const c of chars)
      for (const q of c.raw.quiz ?? []) expect(new Set(q.options).size, `${c.f}: ${q.q}`).toBe(4);
  });
  it('every photo file exists and carries a licence', () => {
    for (const c of chars) {
      if (!c.raw.photo) continue;
      expect(statSync(path.join('public/assets/photos', c.raw.photo.file)).size).toBeGreaterThan(
        1000,
      );
      expect(c.raw.photo.license).toMatch(/CC|Public domain|PD/i);
    }
  });
});

describe('IP boundary', () => {
  const realNames = chars.flatMap((c) =>
    [c.raw.name, c.raw.realName].filter(Boolean).map((s: string) => s.toLowerCase()),
  );
  it('no original shares a name or alias with a published character', () => {
    for (const f of fighters) {
      for (const n of [f.raw.name, f.raw.alias])
        expect(realNames, `${f.f}: ${n}`).not.toContain(String(n).toLowerCase());
    }
  });
  it('game code never imports the published-character roster except the quiz question pool', () => {
    const files =
      walk.length &&
      readdirSync('app/game', { recursive: true })
        .map(String)
        .filter((f) => /\.tsx?$/.test(f));
    for (const f of files || []) {
      const src = readFileSync(path.join('app/game', f), 'utf8');
      expect(src, f).not.toMatch(/allCharacters|getCharacter|gossipPool|content\/characters/);
    }
  });
});
