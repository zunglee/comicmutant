/**
 * Skin → CSS custom properties (reports/skins-design.md T1). Pure and browser-safe: SSR writes the
 * result inline on <html> (no flash) and the picker writes it again on a live switch.
 *
 * Every text pair is pushed to WCAG AA exactly like themeVars(), so a skin author can pick any
 * colours and the page stays readable; test/skins.test.ts checks every registered skin.
 */
import {
  accentVars,
  contrast,
  ensureContrast,
  layerPackVars,
  mix,
  onColor,
  type PackLayer,
  readableOn,
  rgbToHex,
  TEXT_MIN,
  type ThemeVars,
  varsToStyle,
} from '~/lib/theme/compute';
import type { SkinSpec } from './types';

/** Texture tiles for `shape.pattern`, drawn in --halftone (so a character's c1 tints them in comic). */
const PATTERNS: Record<SkinSpec['shape']['pattern'], { image: string; size: string }> = {
  dots: { image: 'radial-gradient(var(--halftone) 1.4px, transparent 1.6px)', size: '14px 14px' },
  scanlines: {
    image: 'repeating-linear-gradient(0deg, var(--halftone) 0 1px, transparent 1px 4px)',
    size: 'auto',
  },
  mandala: {
    image:
      'radial-gradient(circle, transparent 0 9px, var(--halftone) 9px 10px, transparent 10px 15px, var(--halftone) 15px 16px, transparent 16px)',
    size: '48px 48px',
  },
  none: { image: 'none', size: 'auto' },
};

/** Dots inside `.halftone` panels: finer than the body texture, drawn in the ink line colour. */
const HALFTONES: Record<SkinSpec['shape']['pattern'], { image: string; size: string }> = {
  dots: { image: 'radial-gradient(var(--line) 1px, transparent 1.3px)', size: '7px 7px' },
  scanlines: {
    image: 'repeating-linear-gradient(0deg, var(--line) 0 1px, transparent 1px 3px)',
    size: 'auto',
  },
  mandala: {
    image:
      'radial-gradient(circle, transparent 0 5px, var(--line) 5px 6px, transparent 6px 9px, var(--line) 9px 10px, transparent 10px)',
    size: '24px 24px',
  },
  none: { image: 'none', size: 'auto' },
};

/** A bare number of degrees ('-1.2') gets its unit; anything with a unit passes through. */
const deg = (v: string) => (/^-?\d*\.?\d+$/.test(v.trim()) ? `${v.trim()}deg` : v);

/*
 * Backdrop check (ruling S18). The backdrop paints over --bg, so every colour in it is a surface the
 * page text may sit on. Each colour, blended over --bg at its own alpha, must keep the body text
 * pairs at AA; a colour the engine cannot read (hsl, color-mix, named colours, url images) is refused
 * so a skin can never ship a backdrop nobody checked. A failing backdrop is dropped at runtime.
 */
export interface BackdropProblem {
  colour: string;
  reason: string;
}

/** Words a gradient may contain besides colours: functions, shapes, positions, units. */
const BACKDROP_WORDS = new Set(
  'linear-gradient radial-gradient conic-gradient repeating-linear-gradient repeating-radial-gradient repeating-conic-gradient at ellipse circle closest-side closest-corner farthest-side farthest-corner to top bottom left right center from transparent none'.split(
    ' ',
  ),
);

/** Text vars that may sit straight on the page background. */
const PAGE_TEXT = ['--fg', '--muted', '--c1-text', '--c3-text'] as const;

function parseColour(raw: string, vars: ThemeVars): { hex: string; alpha: number } | null {
  const c = raw.trim().toLowerCase();
  if (c === 'transparent') return { hex: '#000000', alpha: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(c)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((h) => h + h).join('') : hex;
    const alpha = full.length === 8 ? Number.parseInt(full.slice(6), 16) / 255 : 1;
    return { hex: `#${full.slice(0, 6)}`, alpha };
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(c)?.[1];
  if (rgb) {
    const parts = rgb.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.slice(0, 3).some((p) => p.endsWith('%'))) return null;
    const [r, g, b] = parts.slice(0, 3).map(Number) as [number, number, number];
    const a = parts[3];
    const alpha = a === undefined ? 1 : a.endsWith('%') ? Number.parseFloat(a) / 100 : Number(a);
    if ([r, g, b, alpha].some((n) => Number.isNaN(n))) return null;
    return { hex: rgbToHex([r, g, b]), alpha };
  }
  const ref = /^var\((--[\w-]+)\)$/.exec(c)?.[1];
  if (ref && ref !== '--backdrop') {
    const v = vars[ref as `--${string}`];
    return v ? parseColour(v, { ...vars, [ref]: '' }) : null;
  }
  return null;
}

function checkBackdrop(backdrop: string, vars: ThemeVars): BackdropProblem[] {
  const bg = vars['--bg'] as string;
  const problems: BackdropProblem[] = [];
  const colourRe =
    /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|var\(--[\w-]+\)|hsla?\([^)]*\)|color-mix\(|url\(/gi;
  for (const m of backdrop.matchAll(colourRe)) {
    const raw = m[0];
    const col = /^(hsl|color-mix|url)/i.test(raw) ? null : parseColour(raw, vars);
    if (!col) {
      problems.push({
        colour: raw,
        reason: 'not a colour the engine can check (use #hex, rgb() or var(--token))',
      });
      continue;
    }
    const surface = mix(bg, col.hex, Math.max(0, Math.min(1, col.alpha)));
    for (const t of PAGE_TEXT) {
      const ratio = contrast(vars[t] as string, surface);
      if (ratio < 4.5)
        problems.push({ colour: raw, reason: `${t} is ${ratio.toFixed(2)}:1 on it (needs 4.5)` });
    }
  }
  const rest = backdrop
    .replace(colourRe, ' ')
    .replace(/-?\d*\.?\d+[a-z%]*/gi, ' ')
    .match(/[a-z][a-z-]*/gi);
  for (const w of rest ?? [])
    if (!BACKDROP_WORDS.has(w.toLowerCase()))
      problems.push({ colour: w, reason: 'unknown word (named colours are not checked)' });
  return problems;
}

/** Why a skin's backdrop would be dropped (empty = it ships). */
export function backdropProblems(spec: SkinSpec): BackdropProblem[] {
  return checkBackdrop(spec.colors.backdrop, skinVars(spec));
}

/** One author colour skinVars() had to move to reach AA (test/skins.test.ts reports these). */
export interface ContrastAdjustment {
  var: `--${string}`;
  from: string;
  to: string;
}

/** The author's colour for each text var, where the spec names one directly. */
function authored(spec: SkinSpec): [`--${string}`, string | undefined][] {
  const k = spec.colors;
  return [
    ['--line-strong', k.lineStrong],
    ['--fg', k.fg],
    ['--card-fg', k.cardFg],
    ['--muted', k.muted],
    ['--c1-text', k.c1Text],
    ['--c1-text-card', k.c1Text],
    ['--c3-text', k.c3Text],
  ];
}

/** Which hand-picked text colours failed AA and were nudged (empty = every pick shipped as written). */
export function contrastAdjustments(spec: SkinSpec): ContrastAdjustment[] {
  const v = skinVars(spec);
  return authored(spec)
    .filter(([name, from]) => from !== undefined && v[name]?.toLowerCase() !== from.toLowerCase())
    .map(([name, from]) => ({ var: name, from: from as string, to: v[name] as string }));
}

const cache = new WeakMap<SkinSpec, ThemeVars>();

/** Every var in SKIN_VAR_NAMES, memoised per spec object. Lengths carry units; --icon-stroke is unitless. */
export function skinVars(spec: SkinSpec): ThemeVars {
  const hit = cache.get(spec);
  if (hit) return hit;
  const { colors: k, type: t, shape: s, motion: m, icons: i } = spec;
  const dark = k.mood === 'dark';
  const bg = k.bg;
  const card = k.card;
  const surface2 = k.surface2;
  const pattern = PATTERNS[s.pattern];
  const halftone = HALFTONES[s.pattern];
  const lineStrong = readableOn(k.lineStrong ?? k.line, [bg, card], 3);
  // Hand-picked text colours win when given, but are still pushed to AA like computed ones.
  const c1Text = k.c1Text ?? k.c1;
  const c3Text = k.c3Text ?? k.c3;
  const vars: ThemeVars = {
    // colour
    '--bg': bg,
    '--fg': readableOn(k.fg, [bg, surface2]),
    '--card': card,
    '--card-fg': ensureContrast(k.cardFg, card, 7),
    '--surface-2': surface2,
    '--muted': readableOn(k.muted, [card, bg]),
    '--line': k.line,
    '--line-strong': lineStrong,
    // Comic keeps its ink outlines on controls (ruling: pixel-identical); other skins use 3:1 borders.
    '--control-line': spec.surfaces === 'character' ? k.line : lineStrong,
    '--c1': k.c1,
    '--c2': k.c2,
    '--c3': k.c3,
    '--on-c1': onColor(k.c1),
    '--on-c2': onColor(k.c2),
    '--on-c3': onColor(k.c3),
    '--btn-c1': ensureContrast(k.c1, onColor(k.c1), 4.5),
    '--c1-text': readableOn(c1Text, [bg, card], TEXT_MIN),
    '--c1-text-card': readableOn(c1Text, [card], TEXT_MIN),
    '--c3-text': readableOn(c3Text, [bg, card], TEXT_MIN),
    '--glow': `${k.c3}88`,
    '--halftone': s.pattern === 'none' ? 'transparent' : dark ? `${k.c1}2e` : `${k.c1}24`,
    '--backdrop': k.backdrop.trim() || 'none',
    '--backdrop-size': k.backdropSize ?? 'auto',
    // type
    '--font-display': t.display,
    '--font-head': t.head,
    '--font-body': t.body,
    '--display-case': t.displayCase,
    '--head-case': t.headCase,
    '--display-tracking': t.displayTracking,
    '--head-tracking': t.headTracking,
    '--display-leading': String(t.displayLeading),
    '--display-weight': String(t.displayWeight),
    '--type-scale': String(t.scale),
    '--font-ui': t.ui,
    '--ui-weight': String(t.uiWeight),
    '--ui-tracking': t.uiTracking,
    '--kicker-tracking': t.kickerTracking,
    '--head-leading': String(t.headLeading ?? 1.1),
    // shape
    '--radius-s': s.radiusS,
    '--radius-m': s.radiusM,
    '--radius-l': s.radiusL,
    '--radius-pill': s.radiusPill,
    '--border-w': s.borderW,
    '--shadow-x': s.shadowX,
    '--shadow-y': s.shadowY,
    '--shadow-blur': s.shadowBlur,
    '--shadow-spread': s.shadowSpread ?? '0px',
    '--shadow-color': s.shadowColor,
    '--tilt': deg(s.tilt),
    '--pattern-image': pattern.image,
    '--pattern-size': pattern.size,
    '--halftone-image': halftone.image,
    '--halftone-size': halftone.size,
    // Calm skins set display type flat; the loud ones keep the comic ink drop.
    '--ink-offset': m.calm ? '0px' : '3px',
    '--button-case': s.buttonCase,
    // motion
    '--ease-out': m.easeOut,
    '--ease-snap': m.easeSnap,
    '--dur-fast': m.durFast,
    '--dur-base': m.durBase,
    '--dur-slow': m.durSlow,
    '--hover-lift': `${m.hoverLift}px`,
    '--press-depth': `${m.pressDepth}px`,
    // icons
    '--icon-stroke': String(i.stroke),
    '--icon-linecap': i.linecap,
  };
  // An unreadable backdrop is dropped rather than painted over --bg (S18); the unit test names it.
  if (vars['--backdrop'] !== 'none' && checkBackdrop(k.backdrop, vars).length) {
    vars['--backdrop'] = 'none';
    vars['--backdrop-size'] = 'auto';
  }
  cache.set(spec, vars);
  return vars;
}

/**
 * How an equipped character pack meets this skin (T3). Lock skins (Sacred) ignore it entirely: the
 * calm realm keeps its own accents whatever is equipped, as the html[data-realm] CSS did.
 */
export function packLayerFor(spec: SkinSpec): PackLayer {
  if (spec.lock) return { mode: 'none' };
  if (spec.surfaces === 'character') return { mode: 'all' };
  const v = skinVars(spec);
  return {
    mode: 'accent',
    bg: v['--bg'] as string,
    card: v['--card'] as string,
    own: accentVars(v),
  };
}

/**
 * Skin vars, then the character pack's vars filtered by the skin's policy: what <html> carries.
 * `slug` lets the house pack (no character equipped) leave a skin-owned skin's accents alone.
 */
export function htmlVars(spec: SkinSpec, pack?: ThemeVars, slug?: string): ThemeVars {
  const base = skinVars(spec);
  return pack ? { ...base, ...layerPackVars(pack, packLayerFor(spec), slug) } : base;
}

/** `color-scheme` for <html>: the character's mood where it owns the surfaces, else the skin's. */
export function htmlMood(spec: SkinSpec, packMood?: 'dark' | 'light'): 'dark' | 'light' {
  return packMood && packLayerFor(spec).mode === 'all' ? packMood : spec.colors.mood;
}

/** Inline `style` text for SSR (skin vars only, plus color-scheme). */
export function skinCss(spec: SkinSpec): string {
  return `${varsToStyle(skinVars(spec))};color-scheme:${spec.colors.mood}`;
}
