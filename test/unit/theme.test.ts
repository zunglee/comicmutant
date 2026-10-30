import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThemeSpec } from '~/lib/schema';
import { contrast, ensureContrast, scopeVars, themeVars } from '~/lib/theme/compute';

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
const specs = [...walk('content/characters'), ...walk('content/fighters')]
  .map((f) => ({ f, t: ThemeSpec.safeParse(JSON.parse(readFileSync(f, 'utf8')).theme) }))
  .filter((x) => x.t.success)
  .map((x) => ({ f: x.f, t: x.t.data as ThemeSpec }));

const PAIRS: [string, string, number][] = [
  ['--fg', '--bg', 4.5],
  ['--card-fg', '--card', 4.5],
  ['--muted', '--card', 4.5],
  ['--c1-text', '--bg', 4.5],
  ['--c1-text-card', '--card', 4.5],
  ['--c3-text', '--bg', 4.5],
  ['--on-c1', '--c1', 3],
  ['--on-c2', '--c2', 3],
  ['--on-c3', '--c3', 3],
];

describe('theme compute', () => {
  it('ensureContrast reaches the target', () => {
    expect(contrast(ensureContrast('#ffff00', '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ensureContrast('#111111', '#000000'), '#000000')).toBeGreaterThanOrEqual(4.5);
  });
  it('has themes to check', () => expect(specs.length).toBeGreaterThan(20));
  it.each(specs.map((s) => [s.f, s.t]))('%s meets WCAG AA on every text pair', (_f, spec) => {
    const v = themeVars(spec as ThemeSpec);
    for (const [fg, bg, min] of PAIRS) {
      expect(
        contrast(v[fg as `--${string}`] ?? '', v[bg as `--${string}`] ?? ''),
        `${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(min);
    }
  });
  it('scopeVars picks readable ink', () => {
    const v = scopeVars({ c1: '#ffd400', c2: '#101010', c3: '#ff2e4d' });
    expect(v['--on-c1']).toBe('#0d0b10');
    expect(v['--on-c2']).toBe('#ffffff');
  });
});
