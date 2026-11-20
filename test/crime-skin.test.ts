import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from '~/lib/theme/compute';
import { packLayerFor, skinVars } from '~/skins/compute';
import { FONT_URLS, preloadHrefs, resolveSkin, SKINS, skinFontImports } from '~/skins/registry';

const crime = SKINS.crime;
const vars = skinVars(crime);
const css = readFileSync('app/skins/css/crime.css', 'utf8');
const region = css.slice(
  css.indexOf('/* skin:crime start */'),
  css.indexOf('/* skin:crime end */'),
);

describe('crime skin spec', () => {
  it('is picker only, owns the surfaces, never locks', () => {
    expect(crime.routes).toEqual([]);
    expect(crime.lock).toBe(false);
    expect(crime.surfaces).toBe('skin');
    expect(resolveSkin({ pathname: '/arena', pinned: null }).id).toBe('comic');
    expect(resolveSkin({ pathname: '/arena', pinned: 'crime' }).id).toBe('crime');
  });

  it('has the night-city shape and motion', () => {
    expect(crime.colors.mood).toBe('dark');
    expect(crime.shape).toMatchObject({
      radiusM: '2px',
      borderW: '2px',
      tilt: '0deg',
      pattern: 'scanlines',
    });
    expect(Number.parseFloat(crime.shape.shadowBlur)).toBeGreaterThan(0);
    expect(crime.type.displayCase).toBe('uppercase');
    expect(crime.motion.wipe).toBe('glitch');
    expect(crime.motion.calm).toBe(false);
    for (const d of [crime.motion.durFast, crime.motion.durBase, crime.motion.durSlow]) {
      const s = Number.parseFloat(d);
      expect(s).toBeGreaterThanOrEqual(0.12);
      expect(s).toBeLessThanOrEqual(0.25);
    }
    expect(crime.atmosphere).toEqual({ kind: 'neon-rain', strength: 0.25 });
    expect(crime.icons).toEqual({ stroke: 2, linecap: 'square' });
  });

  it('every text pair clears AA', () => {
    const bg = vars['--bg'] as string;
    const card = vars['--card'] as string;
    expect(contrast(vars['--fg'] as string, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars['--card-fg'] as string, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars['--muted'] as string, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars['--c1-text'] as string, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars['--c1-text-card'] as string, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars['--c3-text'] as string, bg)).toBeGreaterThanOrEqual(4.5);
    for (const n of ['1', '2', '3']) {
      expect(
        contrast(vars[`--on-c${n}` as '--on-c1'] as string, vars[`--c${n}` as '--c1'] as string),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(vars['--on-c1'] as string, vars['--btn-c1'] as string)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('character themes tint accents only', () => {
    const layer = packLayerFor(crime);
    expect(layer.mode).toBe('accent');
  });

  it('fonts: preload keys resolve and the lazy import is declared', () => {
    for (const k of crime.type.preload) expect(FONT_URLS[k], k).toBeTruthy();
    expect(preloadHrefs(crime)).toHaveLength(crime.type.preload.length);
    expect(crime.type.preload).toContain('oswald-latin-700-normal');
    expect(typeof skinFontImports.crime).toBe('function');
  });
});

describe('crime skin IP self-check', () => {
  const text = [
    readFileSync('app/skins/crime.ts', 'utf8'),
    readFileSync('app/components/atmosphere/neon-rain.tsx', 'utf8'),
    region,
  ].join('\n');
  it('uses no game or brand words, fonts or weapon imagery', () => {
    for (const bad of [
      /gta/i,
      /grand theft/i,
      /vice city/i,
      /rockstar/i,
      /pricedown/i,
      /san andreas/i,
      /gun|pistol|knife|rifle|bullet|blood/i,
    ]) {
      expect(text, String(bad)).not.toMatch(bad);
    }
  });
});

describe('crime css region', () => {
  it('is delimited and scoped to the skin', () => {
    expect(region.length).toBeGreaterThan(200);
    const selectors = [...region.matchAll(/^([^\s@/}{][^{]*)\{/gm)].map((m) => (m[1] ?? '').trim());
    for (const s of selectors) {
      expect(
        s.startsWith('html[data-skin="crime"]') ||
          s.includes('.theme-wipe[data-wipe="glitch"]') ||
          s.startsWith('.cr-canvas'),
        s,
      ).toBe(true);
    }
  });
  it('carries the glitch wipe and reads tokens, not raw hex', () => {
    expect(region).toContain('data-wipe="glitch"');
    expect(region).toContain('crime-glitch');
    expect(region).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
