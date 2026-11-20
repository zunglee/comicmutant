/**
 * Sacred realm as a pure skin (reports/skins-design.md T7, reports/sacred-design.md S8): the spec holds
 * AA contrast, the calm rule holds in the realm's CSS, the CSS carries no raw values or !important,
 * and /sacred is locked to the skin whatever the visitor pinned. The comic skin is untouched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SACRED_FONT_LINKS } from '~/components/sacred/fonts';
import { TRADITION_LOOK } from '~/components/sacred/types';
import { contrast, themeVars } from '~/lib/theme/compute';
import { comic } from '~/skins/comic';
import { contrastAdjustments, htmlMood, htmlVars, packLayerFor, skinVars } from '~/skins/compute';
import { FONT_URLS, preloadHrefs, resolveSkin } from '~/skins/registry';
import { sacred } from '~/skins/sacred';
import { pickSkin } from '~/skins/select';

const ROOT = path.resolve(__dirname, '..');
const css = readFileSync(path.join(ROOT, 'app/skins/css/sacred.css'), 'utf8');
const start = css.indexOf('/* Sacred realm ---');
const end = css.indexOf('/* skin:', start);
/** The realm's stylesheet, comments stripped. */
const region = css.slice(start, end < 0 ? undefined : end).replace(/\/\*[\s\S]*?\*\//g, '');

const v = skinVars(sacred);
const ratio = (a: string, b: string) =>
  contrast(v[a as `--${string}`] as string, v[b as `--${string}`] as string);
const seconds = (d: string) =>
  d.endsWith('ms') ? Number.parseFloat(d) / 1000 : Number.parseFloat(d);

describe('sacred spec', () => {
  it('holds AA on every text pair', () => {
    const pairs: [string, string, number][] = [
      ['--fg', '--bg', 4.5],
      ['--fg', '--surface-2', 4.5],
      ['--card-fg', '--card', 4.5],
      ['--muted', '--card', 4.5],
      ['--muted', '--bg', 4.5],
      ['--c1-text', '--bg', 4.5],
      ['--c1-text-card', '--card', 4.5],
      ['--c3-text', '--bg', 4.5],
      ['--on-c1', '--btn-c1', 4.5],
      ['--on-c3', '--c3', 3],
    ];
    for (const [a, b, min] of pairs)
      expect(ratio(a, b), `${a} on ${b}`).toBeGreaterThanOrEqual(min);
  });

  it('ships its hand-picked text colours unchanged', () => {
    expect(contrastAdjustments(sacred)).toEqual([]);
    expect(v['--c1-text']).toBe('#9a4a05');
    expect(v['--c3-text']).toBe('#0f6467');
  });

  it("reproduces the realm's shape, type and motion", () => {
    expect(v['--radius-m']).toBe('18px');
    expect(v['--radius-s']).toBe(v['--radius-pill']);
    expect(v['--border-w']).toBe('1px');
    expect(v['--shadow-spread']).toBe('-12px');
    expect(v['--tilt']).toBe('0deg');
    expect(v['--button-case']).toBe('none');
    expect(v['--type-scale']).toBe('1.04');
    expect(v['--font-display']).toContain('Cormorant Garamond');
    expect(v['--font-body']).toContain('Mukta');
    expect((v['--backdrop'] ?? '').match(/radial-gradient/g)).toHaveLength(3);
    expect(sacred.atmosphere.kind).toBe('petals-diyas');
    expect(sacred.motion).toMatchObject({ wipe: 'dusk', calm: true });
    expect(sacred.icons.stroke).toBeLessThan(2); // thin line icons
  });

  it('is calm: every duration >= 0.4 s, a ground that does not tilt', () => {
    for (const k of ['--dur-fast', '--dur-base', '--dur-slow'] as const)
      expect(seconds(v[k] as string), k).toBeGreaterThanOrEqual(0.4);
    expect(sacred.motion.calm).toBe(true);
  });

  it('preloads its fonts once, from the spec (Mukta 600 included)', () => {
    expect(sacred.type.preload).toContain('mukta-latin-600-normal');
    for (const k of sacred.type.preload) expect(FONT_URLS[k], k).toBeTruthy();
    expect(preloadHrefs(sacred)).toHaveLength(sacred.type.preload.length);
    expect(SACRED_FONT_LINKS).toEqual([]);
  });
});

describe('sacred CSS region', () => {
  it('was found', () => {
    expect(start).toBeGreaterThan(0);
    expect(region.length).toBeGreaterThan(2000);
  });

  it('has no shake, flash or burst keyframes', () => {
    const names = [...region.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string);
    expect(names.length).toBeGreaterThan(5);
    expect(names.filter((n) => /shake|flash|burst/i.test(n))).toEqual([]);
  });

  it('has no animation or transition shorter than 0.4 s', () => {
    const bad: string[] = [];
    for (const m of region.matchAll(
      /(?:^|[\s;{])(animation|transition)(-duration)?\s*:([^;}]*)/g,
    )) {
      for (const d of (m[3] as string).matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
        if (seconds(`${d[1]}${d[2]}`) < 0.4) bad.push(`${m[1]}: ${d[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has no !important', () => {
    expect(region).not.toContain('!important');
  });

  it('has no data-realm override left (tokens do that job)', () => {
    expect(region).not.toMatch(/data-realm/);
    expect(region).not.toMatch(/html\[data-skin="sacred"\]\s+\.(panel|field|bubble|h-head)\b/);
  });

  it('has no raw hex colour or cubic-bezier', () => {
    expect(region.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(region).not.toContain('cubic-bezier(');
  });

  it('tradition defaults are token mixes, not hex', () => {
    for (const look of Object.values(TRADITION_LOOK)) {
      expect(look.c1).not.toMatch(/#/);
      expect(look.c2).not.toMatch(/#/);
    }
  });
});

describe('sacred selection', () => {
  const req = (cookie?: string) =>
    new Request('http://x.test/sacred', cookie ? { headers: { cookie } } : undefined);

  it('is the skin on /sacred whatever was pinned', () => {
    for (const pin of [undefined, 'cm_skin=crime', 'cm_skin=desi', 'cm_skin=comic']) {
      const r = pickSkin(req(pin), '/sacred/hindu');
      expect(r.id).toBe('sacred');
      expect(r.source).toBe('lock');
    }
  });

  it('lets the pinned choice return once the visitor leaves', () => {
    expect(resolveSkin({ pathname: '/', pinned: 'crime' }).id).toBe('crime');
    expect(resolveSkin({ pathname: '/', pinned: null }).id).toBe('comic');
  });

  it('ignores an equipped character: no accents, no mood', () => {
    expect(packLayerFor(sacred)).toEqual({ mode: 'none' });
    const pack = themeVars({
      slug: 'x',
      palette: { c1: '#00ff00', c2: '#ff00ff', c3: '#0000ff', bg: '#000000', fg: '#ffffff' },
    } as never);
    expect(htmlVars(sacred, pack, 'x')['--c1']).toBe('#e8892f');
    expect(htmlMood(sacred, 'dark')).toBe('light');
  });
});

describe('comic skin is unchanged', () => {
  const c = skinVars(comic);
  it('keeps the house shape, type and motion', () => {
    expect(c['--radius-s']).toBe('6px');
    expect(c['--border-w']).toBe('3px');
    expect(c['--shadow-x']).toBe('5px');
    expect(c['--tilt']).toBe('1.6deg');
    expect(c['--button-case']).toBe('uppercase');
    expect(c['--font-display']).toContain('Bangers');
    expect(c['--dur-fast']).toBe('0.12s');
    expect(c['--bg']).toBe('#12101a');
    expect(comic.surfaces).toBe('character');
    expect(comic.lock).toBe(false);
  });
});
