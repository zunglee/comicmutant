/**
 * Theme → CSS custom properties. Pure and dependency-free so the same code runs in the theme
 * build script, in SSR (no theme flash) and in the browser when a theme pack is equipped.
 *
 * Every text-on-surface pair it emits is pushed to WCAG AA (4.5:1) by nudging lightness, so a
 * content author can pick any three colours and the page stays readable. test/theme.test.ts
 * checks every shipped theme.
 */
import type { ThemeSpec } from '../schema';
import type { Motif } from '../taxonomy';

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Move `fg` toward black or white until it reaches `min` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  const toward = luminance(bg) > 0.18 ? '#000000' : '#ffffff';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(fg, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

/**
 * Floor for accent TEXT colours (c1-text, c3-text): AA 4.5 plus a small margin, so rounding in a
 * browser's blend never lands a kicker at 4.48:1 (critic r1, /c/doga).
 */
export const TEXT_MIN = 4.6;

/** Push `fg` to `min` against every surface it sits on (each pass only moves it further away). */
export function readableOn(fg: string, surfaces: readonly string[], min = 4.5): string {
  let c = fg;
  for (let i = 0; i < 3; i++) for (const s of surfaces) c = ensureContrast(c, s, min);
  return c;
}

/** Black or white ink, whichever reads better on `bg`. */
export function onColor(bg: string): string {
  return contrast('#0d0b10', bg) >= contrast('#ffffff', bg) ? '#0d0b10' : '#ffffff';
}

const INK = '#0d0b10';
const PAPER = '#fbf4e2';

export type ThemeVars = Record<`--${string}`, string>;

/** Bump when themeVars() rules change; every pack version changes with it. */
export const RULES_VERSION = 3;

/** Per-pack cache key: changes when this theme's spec or the compute rules change, nothing else. */
export function packVersion(spec: ThemeSpec): string {
  const text = `${RULES_VERSION}|${spec.palette.c1}|${spec.palette.c2}|${spec.palette.c3}|${spec.motif}|${spec.mood}|${spec.tagline}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function themeVars(spec: ThemeSpec): ThemeVars {
  const { c1, c2, c3 } = spec.palette;
  const dark = spec.mood === 'dark';
  const bg = dark ? mix(INK, c2, 0.12) : mix(PAPER, c1, 0.04);
  const fg = dark ? '#f6f1e7' : '#16120e';
  const card = dark ? mix(bg, c1, 0.1) : mix('#ffffff', c3, 0.06);
  const muted = ensureContrast(mix(fg, bg, 0.35), card, 4.5);
  return {
    '--c1': c1,
    '--c2': c2,
    '--c3': c3,
    '--on-c1': onColor(c1),
    // Button fill nudged until its ink reads at AA (mid greens fail with plain black or white).
    '--btn-c1': ensureContrast(c1, onColor(c1), 4.5),
    '--on-c2': onColor(c2),
    '--on-c3': onColor(c3),
    '--bg': bg,
    '--fg': fg,
    '--card': card,
    '--card-fg': ensureContrast(fg, card, 7),
    '--muted': muted,
    '--line': dark ? '#000000' : INK,
    // Accent text sits on the page AND inside cards (kickers, links): readable on both.
    '--c1-text': readableOn(c1, [bg, card], TEXT_MIN),
    '--c1-text-card': readableOn(c1, [card], TEXT_MIN),
    '--c3-text': readableOn(c3, [bg, card], TEXT_MIN),
    '--glow': `${c3}88`,
    '--halftone': dark ? `${c1}2e` : `${c1}24`,
  };
}

export function varsToStyle(vars: ThemeVars): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

/** Small, cacheable theme pack the browser downloads on "Equip". */
export interface ThemePack {
  slug: string;
  name: string;
  universe: string;
  kind: string;
  motif: Motif;
  mood: 'dark' | 'light';
  tagline: string;
  vars: ThemeVars;
  /** Clip kinds (app/lib/clips) that passed the quality gate for this theme. */
  clips: string[];
  /** Characters render motif clips; originals render the sprite rig. */
  sprite: boolean;
  v: string;
}

/** Manifest row: everything the theme catalogue lists without downloading the pack. */
export interface ThemeIndexRow {
  slug: string;
  name: string;
  universe: string;
  kind: string;
  motif: Motif;
  mood: 'dark' | 'light';
  swatch: [string, string, string];
  tagline: string;
  heat: number;
  /** Pack version (packVersion) — the cache key for /themes/pack/:slug?v=. */
  v: string;
}

/** The keys a character pack still owns under a `surfaces: 'skin'` site skin (reports/skins-design.md T3). */
export const ACCENT_KEYS = [
  '--c1',
  '--c2',
  '--c3',
  '--on-c1',
  '--on-c2',
  '--on-c3',
  '--btn-c1',
  '--c1-text',
  '--c1-text-card',
  '--c3-text',
  '--glow',
] as const;

/**
 * A pack's accent vars only. Its text colours were pushed to AA against the CHARACTER's own bg/card,
 * so when the page surfaces belong to a skin pass them (`on`) and the text colours are re-derived
 * against those surfaces instead.
 */
export function accentVars(vars: ThemeVars, on?: { bg: string; card: string }): ThemeVars {
  const out: ThemeVars = {};
  for (const k of ACCENT_KEYS) {
    const v = vars[k];
    if (v !== undefined) out[k] = v;
  }
  const c1 = vars['--c1'];
  const c3 = vars['--c3'];
  if (on && c1) {
    out['--c1-text'] = readableOn(c1, [on.bg, on.card], TEXT_MIN);
    out['--c1-text-card'] = readableOn(c1, [on.card], TEXT_MIN);
  }
  if (on && c3) out['--c3-text'] = readableOn(c3, [on.bg, on.card], TEXT_MIN);
  return out;
}

/**
 * How much of an equipped character pack lands on <html> under the active skin: everything
 * (`all`, comic), the accents re-checked against the skin's surfaces (`accent`), or nothing
 * (`none`, lock skins such as Sacred stay calm whatever is equipped).
 */
export type PackLayer =
  | { mode: 'all' }
  /** `own` = the skin's own accent vars, shown while the house theme (no character) is equipped. */
  | { mode: 'accent'; bg: string; card: string; own: ThemeVars }
  | { mode: 'none' };

/** The default theme every visitor starts with: "no character equipped", not a choice. */
export const HOUSE_SLUG = 'house';

export function layerPackVars(vars: ThemeVars, layer: PackLayer, slug?: string): ThemeVars {
  if (layer.mode === 'none') return {};
  // The house pack is the comic skin's palette: a skin with its own surfaces keeps its own accents too.
  if (layer.mode === 'accent') return slug === HOUSE_SLUG ? layer.own : accentVars(vars, layer);
  const bg = vars['--bg'];
  const card = vars['--card'];
  // Packs predate --surface-2: derive it from the character's own surfaces so it never shows the
  // skin's default on a character page (no RULES_VERSION bump, cached packs keep working).
  if (!bg || !card) return vars;
  const out: ThemeVars = { ...vars };
  // Under a character-surfaces skin (comic) controls keep the character's ink line, as today.
  if (vars['--line'] && !vars['--control-line']) out['--control-line'] = vars['--line'];
  if (!vars['--surface-2']) out['--surface-2'] = mix(card, bg, 0.5);
  // Control borders at 3:1 on the character's own surfaces (packs carry only the ink --line).
  if (!vars['--line-strong'] && vars['--line']) {
    let c = vars['--line'];
    for (let i = 0; i < 3; i++) c = ensureContrast(ensureContrast(c, bg, 3), card, 3);
    out['--line-strong'] = c;
  }
  return out;
}

/** Palette-only override for a card painted in its character's colours inside any page theme. */
export function scopeVars(p: { c1: string; c2: string; c3: string }): ThemeVars {
  return {
    '--c1': p.c1,
    '--c2': p.c2,
    '--c3': p.c3,
    '--on-c1': onColor(p.c1),
    '--btn-c1': ensureContrast(p.c1, onColor(p.c1), 4.5),
    '--on-c2': onColor(p.c2),
    '--on-c3': onColor(p.c3),
  };
}
