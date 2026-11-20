import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from '~/lib/theme/compute';
import { contrastAdjustments, packLayerFor, skinVars } from '~/skins/compute';
import { FONT_URLS, preloadHrefs, resolveSkin, SKINS, skinFontImports } from '~/skins/registry';

const desi = SKINS.desi;
const v = skinVars(desi);
const sec = (d: string) => Number.parseFloat(d);

describe('desi skin spec', () => {
  it('is the /desi and Indian-character default, in the picker, never a lock', () => {
    expect(desi.routes).toEqual(['/desi']);
    expect(desi.lock).toBe(false);
    expect(resolveSkin({ pathname: '/desi', pinned: null })).toEqual({
      id: 'desi',
      source: 'route',
    });
    expect(resolveSkin({ pathname: '/c/nagraj', pinned: null, universe: 'indian' }).id).toBe(
      'desi',
    );
    expect(resolveSkin({ pathname: '/c/spider-man', pinned: null, universe: 'marvel' }).id).toBe(
      'comic',
    );
    expect(resolveSkin({ pathname: '/', pinned: 'desi' }).id).toBe('desi');
    // Sacred stays sacred whatever is pinned.
    expect(resolveSkin({ pathname: '/sacred', pinned: 'desi' }).id).toBe('sacred');
  });

  it('owns the surfaces; a character only tints accents', () => {
    expect(desi.surfaces).toBe('skin');
    expect(packLayerFor(desi).mode).toBe('accent');
  });

  it('is a light-warm ground with thick borders, hard navy shadows, a 1deg tilt, uppercase display', () => {
    expect(desi.colors.mood).toBe('light');
    expect(v['--border-w']).toBe('3px');
    expect(v['--shadow-blur']).toBe('0px');
    expect(v['--shadow-color']).toBe('var(--line)');
    expect(v['--tilt']).toBe('1deg');
    expect(v['--display-case']).toBe('uppercase');
    expect(v['--font-display']).toMatch(/^"Yatra One"/);
    expect(v['--font-body']).toContain('Devanagari');
  });

  it('every hand-picked colour is already AA (no silent nudges)', () => {
    expect(contrastAdjustments(desi)).toEqual([]);
    expect(contrast(v['--c1-text'] as string, v['--bg'] as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--c3-text'] as string, v['--bg'] as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--fg'] as string, v['--bg'] as string)).toBeGreaterThanOrEqual(7);
  });

  it('moves energetically but not frantically: 0.15-0.3 s, no calm flag', () => {
    const m = desi.motion;
    for (const d of [m.durFast, m.durBase, m.durSlow]) {
      expect(sec(d)).toBeGreaterThanOrEqual(0.15);
      expect(sec(d)).toBeLessThanOrEqual(0.3);
    }
    expect(m.calm).toBe(false);
    expect(m.wipe).toBe('saffron');
    // a bit softer than the comic spring
    expect(m.spring.stiffness).toBeLessThan(SKINS.comic.motion.spring.stiffness);
  });

  it('atmosphere is the dust at 25% over the reading column; icons are thick ink', () => {
    expect(desi.atmosphere.kind).toBe('marigold-dust');
    expect(desi.atmosphere.strength).toBe(0.25);
    expect(desi.icons).toEqual({ stroke: 2.4, linecap: 'round' });
  });

  it('fonts are registered, preloaded and loadable', () => {
    expect(desi.type.fonts.map((f) => f.pkg)).toEqual(
      expect.arrayContaining(['yatra-one', 'teko', 'mukta']),
    );
    for (const k of desi.type.preload) expect(FONT_URLS[k], k).toBeTruthy();
    expect(preloadHrefs(desi)).toHaveLength(desi.type.preload.length);
    expect(typeof skinFontImports.desi).toBe('function');
  });

  it('IP boundary: no national symbol or published-art wording in the spec', () => {
    const text = JSON.stringify(desi).toLowerCase();
    for (const bad of [
      'ashoka',
      'chakra',
      'tiranga',
      'flag',
      'tricolour',
      'raj comics',
      'diamond comics',
    ])
      expect(text, bad).not.toContain(bad);
  });
});

describe('desi-only CSS region', () => {
  const css = readFileSync('app/skins/css/desi.css', 'utf8');
  const a = css.indexOf('/* skin:desi start */');
  const b = css.indexOf('/* skin:desi end */');
  const region = css.slice(a, b);
  it('is delimited and scoped to html[data-skin="desi"] (or the saffron wipe)', () => {
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    const sel = region
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .map((s) => s.split('}').pop()?.trim() ?? '')
      .filter((s) => s && !/^(from|to|\d+%|@)/.test(s));
    for (const s of sel) expect(s, s).toMatch(/html(\[data-skin="desi"\])?/);
  });
  it('has the saffron wipe and no raw colours', () => {
    expect(region).toContain('[data-wipe="saffron"]');
    expect(region).toContain('@keyframes desi-wipe');
    expect(region).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba\(/);
  });
});
