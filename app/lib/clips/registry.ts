/**
 * The 20 motif clip kinds — the animated "GIFs" on every character page. Each kind is a recipe
 * that turns a theme (palette + motif + name) into a looping canvas animation. Kinds that fail
 * the quality gate (gate.ts, reports/clip-quality.md) are left out of theme packs.
 *
 * Colour rule (critic round 1): never trust a palette slot's role. Anything drawn on top of
 * something else picks its colour by contrast (`pick`), and motifs sit on a contrasting plate or
 * get an ink set computed against what is behind them (`inkOn`).
 */
import type { Motif } from '../taxonomy';
import { contrast, luminance, mix } from '../theme/compute';
import type { DrawFn } from './ClipCanvas';
import { drawMotif, type Ink, rng, SFX } from './motifs';

export interface ClipParams {
  c1: string;
  c2: string;
  c3: string;
  motif: Motif;
  name: string;
  year?: number;
}

const TAU = Math.PI * 2;
const LINE = '#0d0b10';
const PAPER = '#fffdf6';
const ease = (x: number) => 1 - (1 - x) ** 3;
const back = (x: number) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pulse = (t: number, period: number, width = 0.18) => {
  const k = (t % period) / period;
  return k < width ? Math.sin((k / width) * Math.PI) : 0;
};

// ── colour by contrast ────────────────────────────────────────────────────────────────

/** First candidate with ≥ `min`:1 contrast on `bg`, else paper or ink. */
export function pick(bg: string, cands: string[], min = 3): string {
  for (const c of cands) if (contrast(c, bg) >= min) return c;
  return contrast(PAPER, bg) >= contrast(LINE, bg) ? PAPER : LINE;
}

/** A quiet halftone tone for a ground: a palette colour (or ink/paper) just off the ground. */
function tone(p: ClipParams, bg: string): string {
  // Near-black grounds: dots in c3 or paper (ink dots there are mud — critic round 4).
  if (luminance(bg) < 0.1) {
    return [p.c3, p.c1, PAPER].find((c) => contrast(c, bg) >= 1.6 && contrast(c, bg) <= 5) ?? PAPER;
  }
  return (
    [p.c1, p.c3, p.c2, LINE, PAPER].find((c) => {
      const k = contrast(c, bg);
      return k >= 1.2 && k <= 2.6;
    }) ?? (luminance(bg) > 0.4 ? LINE : PAPER)
  );
}

/** Halftone texture for a ground; on near-black grounds the (light) dots are drawn small. */
function dots(
  ctx: CanvasRenderingContext2D,
  p: ClipParams,
  bg: string,
  w: number,
  h: number,
  step = 10,
) {
  const dark = luminance(bg) < 0.1;
  halftone(ctx, w, h, tone(p, bg), dark ? Math.max(9, step - 1) : step, dark ? -step / 4.5 : 0);
}

/**
 * A colour that stands off `bg` AND differs from every colour in `avoid` — trying the palette, then
 * paper and ink, before giving up (fallbacks must never equal what they were meant to avoid).
 */
function distinct(p: ClipParams, bg: string, avoid: string[], min = 2.5): string {
  const all = [p.c3, p.c1, p.c2, PAPER, LINE];
  const ok = (c: string) => contrast(c, bg) >= min && avoid.every((a) => contrast(c, a) >= 1.4);
  // Fallback: of the colours that still avoid the others, the one standing furthest off the ground.
  const spare = all.filter((c) => avoid.every((a) => contrast(c, a) >= 1.4));
  const best = (cs: string[]) =>
    cs.reduce((x, y) => (contrast(y, bg) > contrast(x, bg) ? y : x), cs[0] ?? PAPER);
  return all.find(ok) ?? best(spare.length ? spare : all);
}

/** Motif ink computed against the colour the motif sits on. */
function inkOn(p: ClipParams, bg: string): Ink {
  const c1 = pick(bg, [p.c1, p.c3, p.c2], 2.4);
  const c3 = pick(bg, [p.c3, p.c1, PAPER], 2.4);
  const c2 = pick(c1, [p.c2, c1 === PAPER ? LINE : PAPER], 1.8);
  return { c1, c2, c3, line: LINE };
}

/** Clip palettes need two fills that differ; hue is kept, only lightness moves. */
export function clipPalette(p: ClipParams): ClipParams {
  // Too-similar fills: swap the second one for ink or paper — never invent a mixed shade.
  if (contrast(p.c1, p.c2) >= 1.6) return p;
  return { ...p, c2: contrast(p.c1, LINE) >= contrast(p.c1, PAPER) ? LINE : PAPER };
}

// ── shared drawing ────────────────────────────────────────────────────────────────────

function fill(ctx: CanvasRenderingContext2D, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, w, h);
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: string,
  step: number,
  grow: number,
) {
  ctx.fillStyle = c;
  for (let y = 0; y < h + step; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < w + step; x += step) {
      const r = Math.max(0.4, (step / 2.6) * (0.35 + 0.65 * (x / w)) + grow);
      ctx.beginPath();
      ctx.arc(x, y, Math.min(r, step / 1.6), 0, TAU);
      ctx.fill();
    }
  }
}

/**
 * Halftone texture, rendered once per (colour, step, grow, size, device scale) and then blitted:
 * redrawing ~1–3k dots per clip per frame was the site's biggest canvas cost (efficiency audit).
 */
const textures = new Map<string, HTMLCanvasElement>();

function halftone(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: string,
  step = 9,
  grow = 0,
) {
  const g = Math.round(grow * 4) / 4;
  if (
    typeof document === 'undefined' ||
    typeof ctx.getTransform !== 'function' ||
    w <= 0 ||
    h <= 0
  ) {
    drawDots(ctx, w, h, c, step, g);
    return;
  }
  const scale = Math.abs(ctx.getTransform().a) || 1;
  const key = `${c}|${step}|${g}|${Math.round(w)}|${Math.round(h)}|${scale.toFixed(2)}`;
  let tex = textures.get(key);
  if (!tex) {
    tex = document.createElement('canvas');
    tex.width = Math.ceil(w * scale);
    tex.height = Math.ceil(h * scale);
    const t = tex.getContext('2d');
    if (!t) {
      drawDots(ctx, w, h, c, step, g);
      return;
    }
    t.scale(scale, scale);
    drawDots(t, w, h, c, step, g);
    if (textures.size > 64) textures.clear();
    textures.set(key, tex);
  }
  ctx.drawImage(tex, 0, 0, w, h);
}

function sunburst(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  a: string,
  b: string,
  rot: number,
  rays = 18,
  cx = w / 2,
  cy = h / 2,
) {
  const R = Math.hypot(w, h);
  fill(ctx, w, h, a);
  ctx.fillStyle = b;
  for (let i = 0; i < rays; i++) {
    const a0 = rot + (i / rays) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.lineTo(cx + Math.cos(a0 + TAU / rays / 2) * R, cy + Math.sin(a0 + TAU / rays / 2) * R);
    ctx.closePath();
    ctx.fill();
  }
}

/** Radial speed lines; `inward` makes them converge on the centre. */
function speedLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: string,
  t: number,
  seed: string,
  inward = false,
  n = 70,
) {
  const r = rng(seed);
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h);
  ctx.strokeStyle = c;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    let k = (r() + t * (0.6 + r())) % 1;
    if (inward) k = 1 - k;
    const r0 = R * (0.14 + k * 0.62);
    const len = R * (0.06 + r() * 0.2);
    ctx.lineWidth = 1 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
    ctx.stroke();
  }
}

function frame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.lineWidth = 6;
  ctx.strokeStyle = LINE;
  ctx.strokeRect(3, 3, w - 6, h - 6);
}

/** Comic lettering: ink keyline + drop shadow; `fillC` must already contrast with what's behind. */
function word(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fillC: string,
  rot = 0,
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.font = `${size}px Bangers, Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.18;
  // Keyline + shadow flip to paper when the letter fill itself is dark (critic round 2).
  const key = luminance(fillC) < 0.3 ? PAPER : LINE;
  ctx.strokeStyle = key;
  ctx.fillStyle = key;
  ctx.fillText(text, size * 0.08, size * 0.09);
  ctx.strokeText(text, size * 0.08, size * 0.09);
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fillC;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function fitSize(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number) {
  ctx.font = `${start}px Bangers, Impact, sans-serif`;
  const m = ctx.measureText(text).width;
  return m > maxW ? Math.max(10, (start * maxW) / m) : start;
}

function burstShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spikes: number,
  c: string,
  rot = 0,
  inner = 0.66,
) {
  if (r <= 0) return;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i / (spikes * 2)) * TAU;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.fill();
  ctx.lineWidth = Math.max(3, r * 0.06);
  ctx.strokeStyle = LINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** A solid plate behind a motif, coloured to stand out from `bg`. Returns the plate colour. */
function plate(
  ctx: CanvasRenderingContext2D,
  p: ClipParams,
  bg: string,
  x: number,
  y: number,
  r: number,
  spikes = 0,
  rot = 0,
): string {
  const c = pick(bg, [p.c3, PAPER, p.c1], 2.2);
  if (r <= 0) return c;
  // On near-black grounds an ink rim vanishes: add a paper halo so the plate keeps its edge.
  if (luminance(bg) < 0.12) {
    ctx.beginPath();
    ctx.arc(x, y, r * (spikes ? 1.02 : 1) + 3, 0, TAU);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (spikes) burstShape(ctx, x, y, r, spikes, c, rot, 0.8);
  else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.07);
    ctx.strokeStyle = LINE;
    ctx.stroke();
  }
  return c;
}

/** Featureless generic hero silhouette (IP boundary): heroic stance, cape, optional rim light. */
function hero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  c: string,
  raise = 0,
  rim?: string,
  t = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  const wave = Math.sin(t * 3) * 0.08;
  ctx.beginPath();
  ctx.moveTo(-0.38, -1.42);
  ctx.bezierCurveTo(-0.9, -0.9, -1.05 + wave, -0.2, -0.95 + wave * 1.5, 0.12);
  ctx.lineTo(-0.55 + wave, -0.02);
  ctx.lineTo(-0.2, 0.1);
  ctx.lineTo(0.38, -1.42);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.62);
  ctx.lineTo(-0.5, -0.02);
  ctx.lineTo(-0.3, 0);
  ctx.lineTo(0, -0.5);
  ctx.lineTo(0.3, 0);
  ctx.lineTo(0.5, -0.02);
  ctx.lineTo(0.2, -0.62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.46, -1.45);
  ctx.quadraticCurveTo(0, -1.56, 0.46, -1.45);
  ctx.lineTo(0.24, -0.62);
  ctx.lineTo(-0.24, -0.62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -1.74, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillRect(-0.08, -1.6, 0.16, 0.14);
  const ux = 0.62 + raise * 0.05;
  const uy = -1.35 - raise * 0.75;
  ctx.lineWidth = 0.17;
  ctx.beginPath();
  ctx.moveTo(0.4, -1.4);
  ctx.quadraticCurveTo(0.68, -1.2 - raise * 0.3, ux, uy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ux, uy - 0.06, 0.11, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.4, -1.4);
  ctx.lineTo(-0.58, -0.98);
  ctx.lineTo(-0.26, -0.82);
  ctx.stroke();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.045;
    ctx.beginPath();
    ctx.arc(0, -1.74, 0.2, -1.2, 0.9);
    ctx.moveTo(0.46, -1.45);
    ctx.lineTo(0.24, -0.62);
    ctx.moveTo(0.2, -0.62);
    ctx.lineTo(0.5, -0.02);
    ctx.moveTo(0.4, -1.4);
    ctx.quadraticCurveTo(0.68, -1.2 - raise * 0.3, ux, uy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Generic runner with a 3-key run cycle (phase 0..1). Feet at (0,0), height ≈ 2. */
function runner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  c: string,
  phase: number,
) {
  const a = Math.sin(phase * TAU);
  const b = Math.cos(phase * TAU);
  ctx.save();
  ctx.translate(x, y - Math.abs(b) * 0.08 * s);
  ctx.scale(s, s);
  ctx.rotate(0.22);
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Cape streaming back.
  ctx.beginPath();
  ctx.moveTo(-0.1, -1.45);
  ctx.quadraticCurveTo(-0.8, -1.3 + a * 0.08, -1.25, -1.0 + a * 0.12);
  ctx.lineTo(-1.0, -0.82 + a * 0.1);
  ctx.quadraticCurveTo(-0.5, -1.0, -0.05, -0.85);
  ctx.closePath();
  ctx.fill();
  const limb = (
    x0: number,
    y0: number,
    ang1: number,
    ang2: number,
    l1: number,
    l2: number,
    w: number,
  ) => {
    const x1 = x0 + Math.sin(ang1) * l1;
    const y1 = y0 + Math.cos(ang1) * l1;
    const x2 = x1 + Math.sin(ang1 + ang2) * l2;
    const y2 = y1 + Math.cos(ang1 + ang2) * l2;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  limb(0, -0.68, a * 0.9, -Math.max(0, -a) * 1.4 - 0.3, 0.36, 0.38, 0.17);
  limb(0, -0.68, -a * 0.9, -Math.max(0, a) * 1.4 - 0.3, 0.36, 0.38, 0.17);
  ctx.lineWidth = 0.34;
  ctx.beginPath();
  ctx.moveTo(0, -0.7);
  ctx.lineTo(0.02, -1.42);
  ctx.stroke();
  limb(0.02, -1.38, Math.PI - a * 1.1, 0.9, 0.3, 0.28, 0.13);
  limb(0.02, -1.38, Math.PI + a * 1.1, 0.9, 0.3, 0.28, 0.13);
  ctx.beginPath();
  ctx.arc(0.06, -1.66, 0.19, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ── timing helpers ────────────────────────────────────────────────────────────────────

/** Screen shake that decays after a hit at `at` seconds into the loop. */
function shake(k: number, at: number, dur: number, amp: number): [number, number] {
  const d = k - at;
  if (d < 0 || d > dur) return [0, 0];
  const f = 1 - d / dur;
  return [Math.sin(d * 90) * amp * f, Math.cos(d * 73) * amp * 0.6 * f];
}

function runnerOutlined(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  phase: number,
  halo: string,
) {
  // Draw a fattened copy in the halo colour first, so the ink figure reads on any rooftop.
  for (const [dx, dy] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ] as const)
    runner(ctx, x + dx, y + dy, s, halo, phase);
  runner(ctx, x, y, s, LINE, phase);
}

// ── the 20 kinds ──────────────────────────────────────────────────────────────────────

type Recipe = (p: ClipParams) => DrawFn;

export const CLIP_KINDS: { id: string; label: string; loop: number; make: Recipe }[] = [
  {
    id: 'splash',
    label: 'Splash page',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      const L = 3;
      const k = t % L;
      const [sx, sy] = shake(k, 0.62, 0.25, 5);
      ctx.save();
      ctx.translate(sx, sy);
      sunburst(ctx, w + 20, h + 20, p.c2, p.c1, t * 0.5, 18, w / 2, h * 0.42);
      halftone(ctx, w, h, `${LINE}22`, 10);
      const mid = mix(p.c1, p.c2, 0.5);
      const m = Math.min(w, h);
      const pop = back(clamp01(k / 0.35));
      const breathe = 1 + Math.sin(t * 4) * 0.03;
      const R = m * 0.3 * pop * breathe;
      const pc = plate(ctx, p, mid, w / 2, h * 0.42, R, 14, t * 0.4);
      drawMotif(ctx, p.motif, w / 2, h * 0.42, R * 0.62, t, inkOn(p, pc));
      const r = rng(`${p.name}sp`);
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU;
        const d = m * (0.33 + r() * 0.08);
        const tw = Math.max(0, Math.sin(t * 5 + i * 1.7));
        drawStar(ctx, w / 2 + Math.cos(a) * d, h * 0.42 + Math.sin(a) * d, 5 + 7 * tw, PAPER);
      }
      const name = p.name.toUpperCase();
      const size = fitSize(ctx, name, w * 0.86, h * 0.17);
      const slam = clamp01((k - 0.35) / 0.27);
      const sc = slam <= 0 ? 0 : (2.4 - 1.4 * back(slam)) * (1 + Math.sin(t * 3) * 0.02);
      if (sc > 0) word(ctx, name, w / 2, h * 0.83, size, pick(mid, [p.c3, PAPER, p.c1]), -0.05, sc);
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'aura',
    label: 'Power aura',
    loop: 2,
    make: (p) => (ctx, t, w, h) => {
      const ground = pick(PAPER, [p.c2, LINE], 3);
      fill(ctx, w, h, ground);
      const beat = pulse(t, 1, 0.35);
      const rim = pick(ground, [p.c3, p.c1, PAPER], 3);
      // Stepped halftone rings drop off the aura and expand outward on each beat.
      for (let i = 0; i < 3; i++) {
        const q = (t + i / 3) % 1;
        const r = h * (0.3 + q * 0.4);
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.6, r, 0, TAU);
        ctx.lineWidth = 10 * (1 - q) + 1;
        ctx.strokeStyle = tone(p, ground);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.6, h * (0.34 + beat * 0.05), 0, TAU);
      ctx.fillStyle = rim;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = LINE;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.6, h * (0.34 + beat * 0.05), 0, TAU);
      ctx.clip();
      halftone(ctx, w, h, tone(p, rim), 8, beat * 1.5);
      ctx.restore();
      const raise = 0.6 + Math.sin(t * 2) * 0.25;
      const base = h * 0.34;
      // Crisp paper keyline: the figure stamped at small offsets, then the ink figure on top.
      for (const [dx, dy] of [
        [-3, 0],
        [3, 0],
        [0, -3],
        [0, 3],
      ] as const)
        hero(ctx, w / 2 + dx, h * 0.95 + dy, base, PAPER, raise, undefined, t);
      hero(ctx, w / 2, h * 0.95, base, LINE, raise, undefined, t);
      const spots: [number, number][] = [
        [0.17, 0.72],
        [0.84, 0.74],
        [0.18, 0.26],
      ];
      for (const [i, [fx, fy]] of spots.entries()) {
        const bob = Math.sin(t * 3 + i * 2) * h * 0.03;
        const r = h * 0.11;
        const pc = plate(ctx, p, ground, fx * w, fy * h + bob, r);
        drawMotif(
          ctx,
          p.motif,
          fx * w,
          fy * h + bob,
          r * 0.72,
          t + i,
          inkOn(p, pc),
          Math.sin(t + i) * 0.3,
        );
      }
      frame(ctx, w, h);
    },
  },
  {
    id: 'charge',
    label: 'Charge up',
    loop: 2.4,
    make: (p) => (ctx, t, w, h) => {
      const L = 2.4;
      const k = (t % L) / L;
      const m = Math.min(w, h);
      const cy = h * 0.56;
      const tremble = k < 0.7 ? k * 3 : 0;
      ctx.save();
      ctx.translate(Math.sin(t * 70) * tremble, Math.cos(t * 61) * tremble);
      fill(ctx, w + 10, h + 10, p.c2);
      halftone(ctx, w, h, tone(p, p.c2), 11, k * 1.5);
      const lineC = pick(p.c2, [p.c3, PAPER, p.c1]);
      speedLines(ctx, w, h, lineC, t * 1.4, `${p.name}c`, true, 40);
      const size = m * (0.09 + ease(clamp01(k / 0.7)) * 0.07);
      if (k > 0.7 && k < 0.76) burstShape(ctx, w / 2, cy, m * 0.4, 16, PAPER, k * 3, 0.7);
      const pc = plate(ctx, p, p.c2, w / 2, cy, size * 1.35);
      drawMotif(ctx, p.motif, w / 2, cy, size, t * 2, inkOn(p, pc), k * 0.6);
      ctx.restore();
      if (k > 0.7) {
        const q = (k - 0.7) / 0.3;
        // Ring stays below the lettering band (top 24%).
        const ringR = Math.min(cy - h * 0.25, m * 0.2 + q * m * 0.2);
        ctx.beginPath();
        ctx.arc(w / 2, cy, ringR, 0, TAU);
        ctx.lineWidth = 12 * (1 - q) + 4;
        ctx.strokeStyle = LINE;
        ctx.stroke();
        ctx.lineWidth = 8 * (1 - q) + 2;
        ctx.strokeStyle = lineC;
        ctx.stroke();
        const text = SFX[p.motif][1] ?? 'ZAP!';
        const s = fitSize(ctx, text, w * 0.6, h * 0.15);
        word(
          ctx,
          text,
          w / 2,
          h * 0.13,
          s,
          pick(p.c2, [p.c3, PAPER]),
          -0.06,
          back(clamp01(q / 0.4)),
        );
      }
      frame(ctx, w, h);
    },
  },
  {
    id: 'blast',
    label: 'Signature blast',
    loop: 1.6,
    make: (p) => (ctx, t, w, h) => {
      const L = 1.6;
      const k = t % L;
      const [sx, sy] = shake(k, 0.6, 0.3, 6);
      ctx.save();
      ctx.translate(sx, sy);
      const ground = pick(PAPER, [p.c2, LINE], 3);
      fill(ctx, w + 12, h + 12, ground);
      speedLines(ctx, w, h, pick(ground, [p.c3, PAPER], 3), t, p.name);
      const beam = pick(ground, [p.c1, p.c3, PAPER]);
      const core = pick(beam, [PAPER, LINE], 3);
      const y = h * 0.54;
      const ex = w * 0.22;
      const charge = clamp01(k / 0.35);
      // Out (0.35–0.6), hold the hit, then retract into the emitter (1.0–1.4).
      const out = ease(clamp01((k - 0.35) / 0.25));
      const back_ = ease(clamp01((k - 1.0) / 0.4));
      const tail = ex + back_ * (w * 0.82 - ex);
      const head = ex + out * (w * 0.82 - ex);
      const recoil = k > 0.6 && k < 0.8 ? -Math.sin(((k - 0.6) / 0.2) * Math.PI) * w * 0.03 : 0;
      burstShape(
        ctx,
        ex + recoil,
        y,
        h * (0.12 + charge * 0.06),
        10,
        pick(ground, [p.c3, PAPER]),
        t * 2,
        0.6,
      );
      if (k > 0.35 && k < 1.4) {
        const from = k < 1.0 ? ex : Math.min(head, tail);
        ctx.beginPath();
        ctx.moveTo(from, y - 6);
        ctx.lineTo(head, y - h * 0.11);
        ctx.lineTo(head, y + h * 0.11);
        ctx.lineTo(from, y + 6);
        ctx.closePath();
        ctx.fillStyle = beam;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = LINE;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(from, y - 2);
        ctx.lineTo(head, y - h * 0.04);
        ctx.lineTo(head, y + h * 0.04);
        ctx.lineTo(from, y + 2);
        ctx.closePath();
        ctx.fillStyle = core;
        ctx.fill();
      }
      const er = h * 0.1;
      const pc = plate(ctx, p, ground, ex + recoil, y, er);
      drawMotif(ctx, p.motif, ex + recoil, y, er * 0.72, t * 3, inkOn(p, pc), t * 2);
      if (k >= 0.6 && k < 1.3) {
        const q = clamp01((k - 0.6) / 0.25);
        if (k < 0.68) burstShape(ctx, w * 0.8, y, h * 0.3, 14, PAPER, 0.3, 0.7);
        const burstC = pick(ground, [p.c3, PAPER, p.c1]);
        burstShape(
          ctx,
          w * 0.8,
          y,
          h * (0.1 + back(q) * 0.12) * (k > 1.1 ? 1 - (k - 1.1) / 0.2 : 1),
          12,
          burstC,
          k,
        );
        const text = SFX[p.motif][0] ?? 'BOOM!';
        const s = fitSize(ctx, text, w * 0.5, h * 0.16);
        word(ctx, text, w * 0.52, h * 0.2, s, pick(ground, [p.c3, PAPER, p.c1]), -0.12, back(q));
      }
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'impact',
    label: 'Impact frame',
    loop: 1.2,
    make: (p) => (ctx, t, w, h) => {
      const L = 1.2;
      const k = (t % L) / L;
      const [sx, sy] = shake(k, 0, 0.25, 8);
      ctx.save();
      ctx.translate(sx, sy);
      const bg = pick(LINE, [p.c3, PAPER, p.c1]);
      fill(ctx, w + 16, h + 16, bg);
      halftone(ctx, w, h, `${LINE}26`, 8);
      const m = Math.min(w, h);
      const ringC = pick(bg, [p.c1, p.c2, LINE]);
      for (const off of [0, 0.25]) {
        const kk = clamp01((k - off) / 0.7);
        if (kk <= 0 || kk >= 1) continue;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, ease(kk) * m * 0.66, 0, TAU);
        ctx.lineWidth = 14 * (1 - kk);
        ctx.strokeStyle = ringC;
        ctx.stroke();
      }
      const r = rng(`${p.name}deb`);
      for (let i = 0; i < 16; i++) {
        const a = r() * TAU;
        const d = ease(clamp01(k / 0.7)) * m * (0.3 + r() * 0.35);
        ctx.save();
        ctx.translate(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d);
        ctx.rotate(a + k * 9);
        ctx.beginPath();
        ctx.moveTo(-7, -5);
        ctx.lineTo(9, 0);
        ctx.lineTo(-5, 7);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? LINE : ringC;
        ctx.fill();
        ctx.restore();
      }
      // Starts at 60% so the loop's first frame is never empty.
      const punch =
        k < 0.1
          ? 0.6 + (k / 0.1) * 0.65
          : k < 0.22
            ? 1.25 - ((k - 0.1) / 0.12) * 0.25
            : 1 + Math.sin(k * 20) * 0.02;
      const R = m * 0.36 * punch;
      const burstC = pick(bg, [p.c1, p.c2, LINE], 2);
      burstShape(ctx, w / 2, h / 2, R, 12, burstC, k * 0.6);
      const text = SFX[p.motif][1] ?? 'POW!';
      const s = fitSize(ctx, text, R * 1.2, h * 0.24);
      word(ctx, text, w / 2, h / 2, s, pick(burstC, [PAPER, p.c3]), -0.08, punch);
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'orbit',
    label: 'Orbit',
    loop: 4,
    make: (p) => (ctx, t, w, h) => {
      fill(ctx, w, h, p.c2);
      dots(ctx, p, p.c2, w, h, 12);
      const m = Math.min(w, h);
      const rx = w * 0.36;
      const ry = h * 0.29;
      const trail = pick(p.c2, [p.c3, PAPER, p.c1]);
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, rx, ry, 0, 0, TAU);
      ctx.lineWidth = 6;
      ctx.strokeStyle = LINE;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = trail;
      ctx.stroke();
      const sats = Array.from({ length: 3 }, (_, i) => t * 1.5 + (i / 3) * TAU);
      const sat = (a: number, i: number) => {
        const x = w / 2 + Math.cos(a) * rx;
        const y = h / 2 + Math.sin(a) * ry;
        const near = (Math.sin(a) + 1) / 2;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, rx, ry, 0, a - 0.7, a - 0.1);
        ctx.lineCap = 'round';
        ctx.lineWidth = m * 0.04;
        ctx.strokeStyle = LINE;
        ctx.stroke();
        ctx.lineWidth = m * 0.026;
        ctx.strokeStyle = trail;
        ctx.stroke();
        // Squash as it swings through the near point, like a thrown energy ball.
        const sq = Math.max(0, Math.sin(a)) ** 6 * 0.25;
        const r = m * (0.1 + near * 0.025);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1 + sq, 1 - sq);
        const pc = plate(ctx, p, p.c2, 0, 0, r);
        drawMotif(ctx, p.motif, 0, 0, r * 0.78, t + i, inkOn(p, pc), a);
        ctx.restore();
      };
      sats.forEach((a, i) => {
        if (Math.sin(a) < 0) sat(a, i);
      });
      const pc = plate(
        ctx,
        p,
        p.c2,
        w / 2,
        h / 2,
        m * 0.14 * (1 + pulse(t, 2, 0.2) * 0.12),
        12,
        t * 0.3,
      );
      drawMotif(ctx, p.motif, w / 2, h / 2, m * 0.1, t, inkOn(p, pc));
      sats.forEach((a, i) => {
        if (Math.sin(a) >= 0) sat(a, i);
      });
      frame(ctx, w, h);
    },
  },
  {
    id: 'storm',
    label: 'Vortex',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      // Tapered spiral arms sucking inward; the motif counter-spins and pulses at the eye.
      const ground = pick(PAPER, [p.c2, LINE], 3);
      fill(ctx, w, h, ground);
      const m = Math.min(w, h);
      const armC = [pick(ground, [p.c1, p.c3, PAPER], 3), pick(ground, [p.c3, PAPER, p.c1], 3)];
      for (let arm = 0; arm < 4; arm++) {
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= 40; i++) {
          const u = i / 40;
          const rad = m * (0.62 - u * 0.48);
          const a = arm * (TAU / 4) + u * 4.2 - t * 1.6;
          pts.push([
            w / 2 + Math.cos(a) * rad,
            h / 2 + Math.sin(a) * rad,
            (1 - u) * m * 0.06 + 1.5,
          ]);
        }
        for (const [pass, col] of [
          [1, LINE],
          [0, armC[arm % 2] ?? PAPER],
        ] as const) {
          for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1] as [number, number, number];
            const [x1, y1, wd] = pts[i] as [number, number, number];
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineCap = 'round';
            ctx.lineWidth = wd + pass * 4;
            ctx.strokeStyle = col;
            ctx.stroke();
          }
        }
      }
      const beat = pulse(t, 1.5, 0.25);
      const pc = plate(ctx, p, ground, w / 2, h / 2, m * (0.15 + beat * 0.04), 12, t * 2);
      drawMotif(ctx, p.motif, w / 2, h / 2, m * (0.105 + beat * 0.03), t, inkOn(p, pc), -t * 2);
      frame(ctx, w, h);
    },
  },
  {
    id: 'wipe',
    label: 'Halftone wipe',
    loop: 2.4,
    make: (p) => (ctx, t, w, h) => {
      const L = 2.4;
      const k = (t % L) / L;
      const half = k < 0.5;
      const q = (half ? k * 2 : (k - 0.5) * 2) * 1.5 - 0.25;
      const [from, to] = half ? [p.c2, p.c1] : [p.c1, p.c2];
      fill(ctx, w, h, from);
      const step = 22;
      // Dot edges in paper when the incoming colour is near-black, ink otherwise.
      const edge = luminance(to) < 0.1 || luminance(from) < 0.1 ? PAPER : LINE;
      for (let y = -step; y < h + step; y += step) {
        for (let x = -step; x < w + step; x += step) {
          const e = (x / w) * 0.8 + (y / h) * 0.2;
          const d = q - e;
          if (d > 0.18) {
            ctx.fillStyle = to;
            ctx.fillRect(x - step / 2, y - step / 2, step + 1, step + 1);
          } else if (d > -0.02) {
            const r = ((d + 0.02) / 0.2) * step * 0.72;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
            ctx.fillStyle = to;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = edge;
            ctx.stroke();
          }
        }
      }
      const pass = 1 - Math.min(1, Math.abs(q - 0.5) / 0.15);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(1 + pass * 0.25, 1 - pass * 0.2);
      const pc = plate(
        ctx,
        p,
        luminance(from) < 0.1 ? LINE : mix(p.c1, p.c2, 0.5),
        0,
        0,
        Math.min(w, h) * 0.22,
        10,
        k * 2,
      );
      drawMotif(ctx, p.motif, 0, 0, Math.min(w, h) * 0.15, t, inkOn(p, pc), k);
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'speedlines',
    label: 'Zoom rush',
    loop: 1.6,
    make: (p) => (ctx, t, w, h) => {
      fill(ctx, w, h, PAPER);
      speedLines(ctx, w, h, LINE, t * 1.6, p.name, false, 90);
      const bc = pick(PAPER, [p.c1, p.c2, p.c3]);
      // Two bursts rushing at camera; they leave the frame by growing past it (no fades).
      for (let i = 1; i >= 0; i--) {
        const k = ((t / 1.6 + i / 2) % 1) ** 2;
        const size = Math.min(w, h) * (0.04 + k * 0.62);
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, size * 1.5, 0, TAU);
        ctx.fillStyle = PAPER;
        ctx.fill();
        burstShape(ctx, w / 2, h / 2, size * 1.35, 12, bc, k * 2);
        drawMotif(ctx, p.motif, w / 2, h / 2, size, t, inkOn(p, bc), k);
      }
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.46, 0, TAU);
      ctx.lineWidth = 3;
      ctx.strokeStyle = LINE;
      ctx.setLineDash([10, 14]);
      ctx.stroke();
      ctx.setLineDash([]);
      frame(ctx, w, h);
    },
  },
  {
    id: 'glitch',
    label: 'Glitch reveal',
    loop: 2.4,
    make: (p) => (ctx, t, w, h) => {
      fill(ctx, w, h, LINE);
      const name = p.name.toUpperCase();
      const s = fitSize(ctx, name, w * 0.78, h * 0.2);
      const k = (t % 2.4) / 2.4;
      const tick = Math.floor(t * 12);
      const late = ((tick * 2654435761) >>> 0) % 13 === 0;
      const hard = k > 0.48 && k < 0.53;
      const g = k < 0.3 ? (1 - k / 0.3) * 12 : hard ? 14 : late ? 6 : 0;
      const a = pick(LINE, [p.c1, p.c3]);
      const b = pick(
        LINE,
        [p.c3, p.c2, PAPER].filter((c) => c !== a),
      );
      const ty = h * 0.74;
      const m = Math.min(w, h);
      const pr = m * 0.23 * (k < 0.3 ? back(clamp01(k / 0.3)) : 1);
      const off = g ? g * 0.8 : 0;
      if (g) {
        plate(ctx, { ...p, c3: a }, LINE, w / 2 - off, h * 0.36, pr);
        plate(ctx, { ...p, c3: b }, LINE, w / 2 + off, h * 0.36, pr);
      }
      const pc = plate(ctx, p, LINE, w / 2, h * 0.36, pr);
      drawMotif(ctx, p.motif, w / 2, h * 0.36, pr * 0.7, t, inkOn(p, pc));
      ctx.save();
      ctx.beginPath();
      ctx.rect(10, 10, w - 20, h - 20);
      ctx.clip();
      ctx.font = `${s}px Bangers, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = a;
      ctx.fillText(name, w / 2 - g, ty);
      ctx.fillStyle = b;
      ctx.fillText(name, w / 2 + g, ty);
      ctx.fillStyle = PAPER;
      ctx.fillText(name, w / 2, ty);
      for (let i = 0; i < 3; i++) {
        if (!g) break;
        const y = ty - s / 2 + ((i * 0.37 + tick * 0.13) % 1) * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(10, y, w - 20, s * 0.16);
        ctx.clip();
        fill(ctx, w, h, i % 2 ? a : b);
        ctx.fillStyle = LINE;
        ctx.fillText(name, w / 2 + g * (i % 2 ? 1 : -1), ty);
        ctx.restore();
      }
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'panels',
    label: 'Three-panel strip',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      // 2 + 1 layout: two small panels on top (wind-up, rush), one wide panel below (hit).
      fill(ctx, w, h, PAPER);
      const k = (t % 3) / 3;
      const gap = 10;
      const topH = (h - gap * 3) * 0.45;
      const botH = h - gap * 3 - topH;
      const halfW = (w - gap * 3) / 2;
      const boxes: [number, number, number, number, string][] = [
        [gap, gap, halfW, topH, p.c1],
        [gap * 2 + halfW, gap, halfW, topH, p.c2],
        [gap, gap * 2 + topH, w - gap * 2, botH, p.c3],
      ];
      const act = Math.min(2, Math.floor(k * 3.2));
      for (const [i, [x, y, bw, bh, bg]] of boxes.entries()) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, bw, bh);
        ctx.clip();
        fill(ctx, w, h, bg);
        dots(ctx, p, bg, w, h, 8);
        const cx = x + bw / 2;
        const cy = y + bh / 2;
        const on = i <= act;
        const local = i === act ? clamp01((k * 3.2 - act) / 0.35) : on ? 1 : 0;
        if (i === 1 && on)
          speedLines(ctx, w * 2, h * 2, pick(bg, [LINE, PAPER], 3), t, `${p.name}p`, false, 24);
        if (i === 2 && on)
          burstShape(
            ctx,
            cx - bw * 0.18,
            cy,
            bh * 0.48 * back(local),
            12,
            pick(bg, [PAPER, LINE], 3),
            t,
          );
        const pr = Math.min(bw, bh) * (i === 2 ? 0.36 : 0.34) * (on ? back(local) : 0.75);
        const px = i === 2 ? cx - bw * 0.18 : cx + (i === 1 ? Math.sin(t * 8) * 4 : 0);
        const plateBg = i === 2 && on ? pick(bg, [PAPER, LINE], 3) : bg;
        const pc = plate(
          ctx,
          { ...p, c3: pick(plateBg, [PAPER, LINE, p.c3], 3) },
          plateBg,
          px,
          cy,
          pr,
        );
        drawMotif(ctx, p.motif, px, cy, pr * 0.74, t + i, inkOn(p, pc), i * 0.5);
        if (i === 2 && on) {
          const text = SFX[p.motif][2] ?? 'WOW!';
          const s = fitSize(ctx, text, bw * 0.42, bh * 0.4);
          word(ctx, text, x + bw * 0.72, cy, s, pick(bg, [PAPER, LINE]), -0.1, back(local));
        }
        ctx.restore();
        ctx.lineWidth = 4;
        ctx.strokeStyle = LINE;
        ctx.strokeRect(x, y, bw, bh);
      }
      frame(ctx, w, h);
    },
  },
  {
    id: 'rain',
    label: 'Motif rain',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      const sky = p.c2;
      fill(ctx, w, h, sky);
      dots(ctx, p, sky, w, h, 11);
      const m = Math.min(w, h);
      const floor = h * 0.82;
      const drop = pick(sky, [p.c3, PAPER, p.c1], 3);
      // A paper floor band with an ink keyline.
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, floor, w, h - floor);
      ctx.lineWidth = 4;
      ctx.strokeStyle = LINE;
      ctx.beginPath();
      ctx.moveTo(0, floor);
      ctx.lineTo(w, floor);
      ctx.stroke();
      const r = rng(`${p.name}rain`);
      for (let i = 0; i < 9; i++) {
        const x = w * (0.08 + ((i * 0.37 + r() * 0.05) % 0.84));
        const life = (t * (0.5 + r() * 0.25) + r()) % 1;
        const y = h * 0.04 + (floor - h * 0.06) * life;
        const s = m * (0.03 + r() * 0.02);
        if (life < 0.9) {
          // Tapered opaque drop.
          ctx.beginPath();
          ctx.moveTo(x, y - s * 3);
          ctx.quadraticCurveTo(x + s * 1.1, y - s * 0.2, x, y + s);
          ctx.quadraticCurveTo(x - s * 1.1, y - s * 0.2, x, y - s * 3);
          ctx.fillStyle = drop;
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = LINE;
          ctx.stroke();
        } else {
          // Crown splash on the floor.
          const q = (life - 0.9) / 0.1;
          ctx.strokeStyle = LINE;
          ctx.fillStyle = drop;
          for (let j = -2; j <= 2; j++) {
            const a = -Math.PI / 2 + j * 0.45;
            const len = s * (1.5 + q * 2.5);
            ctx.beginPath();
            ctx.ellipse(
              x + Math.cos(a) * len,
              floor - 2 + Math.sin(a) * len,
              s * 0.45,
              s * 0.45,
              0,
              0,
              TAU,
            );
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
      // One big motif drop leads the pack.
      const life = (t / 1.5) % 1;
      const by = h * 0.18 + (floor - h * 0.32) * life ** 1.4;
      const pr = m * 0.12;
      const pc = plate(ctx, p, sky, w * 0.5, by, pr);
      drawMotif(ctx, p.motif, w * 0.5, by, pr * 0.72, t, inkOn(p, pc), Math.sin(t * 2) * 0.3);
      frame(ctx, w, h);
    },
  },
  {
    id: 'shockwave',
    label: 'Ground pound',
    loop: 2,
    make: (p) => (ctx, t, w, h) => {
      const L = 2;
      const k = (t % L) / L;
      const hit = 0.3;
      const [sx, sy] = shake(k, hit, 0.14, 8);
      ctx.save();
      ctx.translate(sx, sy);
      const gy = h * 0.7;
      const sky = p.c2;
      fill(ctx, w + 16, h + 16, sky);
      dots(ctx, p, sky, w, gy, 11);
      // Paper floor band with ink keyline: never merges with the sky.
      ctx.fillStyle = PAPER;
      ctx.fillRect(-10, gy, w + 20, h - gy + 10);
      dots(ctx, p, PAPER, w, h, 9);
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, w + 20, gy + 10);
      dots(ctx, p, sky, w, gy, 11);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-10, gy);
      ctx.lineTo(w + 10, gy);
      ctx.stroke();
      const m = Math.min(w, h);
      const R = m * 0.14;
      if (k >= hit) {
        const d = (k - hit) / (1 - hit);
        const cr = rng(`${p.name}cr`);
        ctx.fillStyle = LINE;
        ctx.beginPath();
        const n = 12;
        for (let i = 0; i < n * 2; i++) {
          const a = (i / (n * 2)) * TAU;
          const rr = (i % 2 ? 0.25 : 0.6 + cr() * 0.6) * w * 0.3 * ease(clamp01(d * 4));
          ctx.lineTo(w / 2 + Math.cos(a) * rr, gy + h * 0.1 + Math.sin(a) * rr * 0.25);
        }
        ctx.closePath();
        ctx.fill();
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (1.1 + (i / 6) * 0.8);
          const px = w / 2 + Math.cos(a) * d * w * 0.9;
          const py = gy + Math.sin(a) * d * h * 1.2 + d * d * h * 1.6;
          if (py < gy && px > w * 0.06 && px < w * 0.94) {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(d * 10 + i);
            ctx.fillStyle = i % 2 ? LINE : PAPER;
            ctx.fillRect(-5, -5, 10, 10);
            ctx.lineWidth = 2;
            ctx.strokeStyle = LINE;
            ctx.strokeRect(-5, -5, 10, 10);
            ctx.restore();
          }
        }
        if (d < 0.55) {
          const text = SFX[p.motif][0] ?? 'THUD!';
          const s = fitSize(ctx, text, w * 0.42, h * 0.15);
          word(
            ctx,
            text,
            w * 0.66,
            h * 0.17,
            s,
            pick(sky, [p.c3, PAPER, p.c1]),
            0.1,
            back(clamp01(d * 6)),
          );
        }
      }
      let y: number;
      let sqx = 1;
      let sqy = 1;
      const top = R * 1.2;
      if (k < hit) y = top + (gy - R - top) * (k / hit) ** 2;
      else {
        const d = (k - hit) / (1 - hit);
        y = gy - R - Math.sin(d * Math.PI) * h * 0.16 * (1 - d * 0.4);
        const sq = Math.max(0, 1 - (k - hit) / 0.12);
        sqx = 1 + sq * 0.35;
        sqy = 1 - sq * 0.35;
      }
      ctx.save();
      ctx.translate(w / 2, y + R);
      ctx.scale(sqx, sqy);
      const pc = plate(ctx, p, sky, 0, -R, R, 12, t);
      drawMotif(ctx, p.motif, 0, -R, R * 0.66, t, inkOn(p, pc));
      ctx.restore();
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'spotlight',
    label: 'Night signal',
    loop: 4,
    make: (p) => (ctx, t, w, h) => {
      const night = [p.c2, p.c1, p.c3].find((c) => luminance(c) < 0.08) ?? LINE;
      fill(ctx, w, h, night);
      halftone(ctx, w, h * 0.5, pick(night, [PAPER, p.c3], 2), 16, -1.5);
      const lamp = pick(night, [p.c3, p.c1, PAPER], 6);
      const k = (t % 4) / 4;
      // Long sweep (0–0.4), lands and pulses (0.4–0.75), swings back.
      const sweep =
        k < 0.4 ? -0.55 + ease(k / 0.4) * 0.55 : k < 0.75 ? 0 : -((k - 0.75) / 0.25) * 0.55;
      const land = k > 0.4 && k < 0.75 ? pulse(k - 0.4, 0.35, 0.3) : 0;
      const lx = w * 0.5;
      const ly = h * 0.8;
      const a = -Math.PI / 2 + sweep;
      const reach = h * 0.55;
      const cx = lx + Math.cos(a) * reach;
      const cy = ly + Math.sin(a) * reach;
      const nx = Math.cos(a + Math.PI / 2);
      const ny = Math.sin(a + Math.PI / 2);
      const spread = w * 0.16 * (1 + land * 0.15);
      // Opaque beam with ink stripes (no transparency).
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lx - 6, ly);
      ctx.lineTo(cx + nx * spread, cy + ny * spread);
      ctx.lineTo(cx - nx * spread, cy - ny * spread);
      ctx.lineTo(lx + 6, ly);
      ctx.closePath();
      ctx.fillStyle = lamp;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = night;
      ctx.lineWidth = 3;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(
          cx + nx * spread * (i / 6) * 1.2 + Math.cos(a) * h,
          cy + ny * spread * (i / 6) * 1.2 + Math.sin(a) * h,
        );
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, spread * 1.15, h * 0.12 * (1 + land * 0.15), 0, 0, TAU);
      ctx.fillStyle = lamp;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = LINE;
      ctx.stroke();
      ctx.restore();
      const sig = pick(lamp, [LINE, p.c2, p.c1], 4);
      drawMotif(ctx, p.motif, cx, cy, h * (0.085 + land * 0.012), t, {
        c1: sig,
        c2: lamp,
        c3: sig,
        line: sig,
      });
      const r = rng(`${p.name}city`);
      let x = -4;
      while (x < w) {
        const bw = 18 + r() * 30;
        const bh = h * (0.12 + r() * 0.16);
        ctx.fillStyle = LINE;
        ctx.fillRect(x, h - bh, bw, bh);
        ctx.strokeStyle = lamp;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, h - bh, bw - 2, bh + 4);
        ctx.fillStyle = lamp;
        for (let wy = h - bh + 7; wy < h - 6; wy += 10) {
          for (let wx = x + 4; wx < x + bw - 5; wx += 8) if (r() > 0.6) ctx.fillRect(wx, wy, 3, 4);
        }
        x += bw + 3;
      }
      ctx.fillStyle = LINE;
      ctx.fillRect(lx - 14, ly, 28, h - ly);
      ctx.strokeStyle = lamp;
      ctx.strokeRect(lx - 14, ly, 28, h - ly);
      ctx.beginPath();
      ctx.arc(lx, ly, 10, 0, TAU);
      ctx.fillStyle = lamp;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = LINE;
      ctx.stroke();
      frame(ctx, w, h);
    },
  },
  {
    id: 'kaleido',
    label: 'Kaleidoscope',
    loop: 4,
    make: (p) => (ctx, t, w, h) => {
      fill(ctx, w, h, LINE);
      const seg = 6;
      const R = Math.max(w, h);
      const m = Math.min(w, h);
      const beat = 1 + pulse(t, 1, 0.3) * 0.2;
      // Palette wedges first (c1/c2/c3), paper only as a last resort.
      const pal = [p.c1, p.c2, p.c3];
      let A = p.c1;
      let B = p.c2;
      let best = 0;
      for (const x of pal)
        for (const y of pal)
          if (x !== y && contrast(x, y) > best) {
            best = contrast(x, y);
            A = x;
            B = y;
          }
      if (best < 1.5) B = contrast(A, PAPER) > contrast(A, LINE) ? PAPER : LINE;
      for (let i = 0; i < seg; i++) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        // Odd wedges mirror about their own far edge, so the six tile the disc exactly.
        ctx.rotate(((i + (i % 2)) / seg) * TAU + t * 0.4);
        if (i % 2) ctx.scale(1, -1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, 0, TAU / seg);
        ctx.closePath();
        const bg = i % 2 ? B : A;
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = LINE;
        ctx.stroke();
        ctx.clip();
        // One motif per wedge, centred in the wedge (never sliced by its edges).
        const mid = TAU / seg / 2;
        drawMotif(
          ctx,
          p.motif,
          Math.cos(mid) * m * 0.36,
          Math.sin(mid) * m * 0.36,
          m * 0.075 * beat,
          t * 1.5,
          inkOn(p, bg),
          t,
        );
        ctx.restore();
      }
      const pc = plate(ctx, p, A, w / 2, h / 2, m * 0.13 * beat, 10, -t);
      drawMotif(ctx, p.motif, w / 2, h / 2, m * 0.09 * beat, t, inkOn(p, pc));
      frame(ctx, w, h);
    },
  },
  {
    id: 'heartbeat',
    label: 'Power meter',
    loop: 2.4,
    make: (p) => (ctx, t, w, h) => {
      const L = 2.4;
      const k = (t % L) / L;
      const fillUp = k < 0.45 ? ease(k / 0.45) : k < 0.7 ? 1 : 1 - ease((k - 0.7) / 0.3);
      const [sx, sy] = shake(k, 0.45, 0.1, 6);
      ctx.save();
      ctx.translate(sx, sy);
      const ground = p.c2;
      fill(ctx, w + 12, h + 12, ground);
      dots(ctx, p, ground, w, h, 10);
      const name = p.name.toUpperCase();
      word(
        ctx,
        name,
        w / 2,
        h * 0.14,
        fitSize(ctx, name, w * 0.8, h * 0.13),
        pick(ground, [p.c3, PAPER, p.c1]),
        -0.03,
      );
      const segs = 8;
      const gx = w * 0.1;
      const gw = w * 0.64;
      const gy = h * 0.42;
      const gh = h * 0.2;
      ctx.fillStyle = LINE;
      ctx.fillRect(gx - 6, gy - 6, gw + 12, gh + 12);
      const on = pick(LINE, [p.c1, p.c3, PAPER]);
      const hot = pick(LINE, [p.c3, PAPER, p.c1]);
      const lit = Math.round(fillUp * segs);
      for (let i = 0; i < segs; i++) {
        const sw = gw / segs;
        const x = gx + i * sw + 3;
        if (i < lit) {
          ctx.fillStyle = i >= segs - 2 ? hot : on;
          ctx.fillRect(x, gy + 3, sw - 6, gh - 6);
        } else {
          // Empty cells stay visible: paper outline on the ink tray.
          ctx.strokeStyle = PAPER;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, gy + 4, sw - 8, gh - 8);
        }
      }
      // The motif plug at the gauge's end lights up at MAX.
      const slam = k >= 0.45 && k < 0.75 ? clamp01((k - 0.45) / 0.08) : 0;
      const plugX = gx + gw + w * 0.12;
      const plugR = h * 0.12 * (1 + slam * 0.25);
      if (slam > 0) burstShape(ctx, plugX, gy + gh / 2, plugR * 1.5 * back(slam), 12, hot, k * 4);
      const pc = plate(ctx, p, ground, plugX, gy + gh / 2, plugR);
      drawMotif(ctx, p.motif, plugX, gy + gh / 2, plugR * 0.7, t, inkOn(p, pc));
      const label = slam > 0 ? 'MAX!' : `${Math.round(fillUp * 100)}%`;
      word(
        ctx,
        label,
        w * 0.42,
        h * 0.82,
        fitSize(ctx, slam > 0 ? 'MAX!' : '100%', w * 0.4, h * 0.17),
        pick(ground, [p.c3, PAPER, p.c1]),
        slam > 0 ? -0.08 : 0,
        slam > 0 ? back(slam) : 1,
      );
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'portal',
    label: 'Portal',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      const ground = pick(PAPER, [p.c2, LINE], 3);
      fill(ctx, w, h, ground);
      dots(ctx, p, ground, w, h, 12);
      const cx = w / 2;
      const cy = h / 2;
      const k = (t % 3) / 3;
      const m = Math.min(w, h);
      const open = k < 0.3 ? back(k / 0.3) : k > 0.85 ? 1 - ease((k - 0.85) / 0.15) : 1;
      const rings = [p.c1, p.c3, p.c2].map((c) => pick(ground, [c, PAPER], 1.6));
      const R = m * 0.4 * Math.max(0, open);
      if (R > 1) {
        for (let i = 0; i < 4; i++) {
          const r = R * (1 - i * 0.18);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.fillStyle = rings[i % 3] ?? PAPER;
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = LINE;
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * (i % 2 ? -1.6 : 1.3) * (1 + i * 0.2));
          ctx.setLineDash([r * 0.25, r * 0.18]);
          ctx.lineWidth = 4;
          ctx.strokeStyle = LINE;
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.9, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.42, 0, TAU);
        ctx.fillStyle = LINE;
        ctx.fill();
      }
      const popQ = k < 0.3 ? 0 : clamp01((k - 0.3) / 0.2);
      const pop =
        k > 0.85
          ? 1 - ease((k - 0.85) / 0.15)
          : popQ > 0
            ? back(popQ) * (1 + Math.sin(t * 6) * 0.04)
            : 0;
      if (pop > 0) {
        const pc = plate(ctx, p, LINE, cx, cy, m * 0.19 * pop, 12, t);
        drawMotif(ctx, p.motif, cx, cy, m * 0.13 * pop, t * 2, inkOn(p, pc));
      }
      if (k > 0.4 && k < 0.75) {
        const text = SFX[p.motif][2] ?? 'VWOOM!';
        const s = fitSize(ctx, text, w * 0.5, h * 0.14);
        word(
          ctx,
          text,
          w * 0.68,
          h * 0.14,
          s,
          pick(ground, [p.c3, PAPER, p.c1]),
          0.1,
          back(clamp01((k - 0.4) / 0.1)),
        );
      }
      frame(ctx, w, h);
    },
  },
  {
    id: 'sticker',
    label: 'Sound-effect stickers',
    loop: 2.4,
    make: (p) => (ctx, t, w, h) => {
      fill(ctx, w, h, p.c1);
      halftone(ctx, w, h, `${LINE}30`, 9);
      const words = SFX[p.motif];
      const spots: [number, number, number][] = [
        [0.3, 0.27, -0.18],
        [0.7, 0.5, 0.12],
        [0.36, 0.76, -0.06],
      ];
      const k = (t % 2.4) / 2.4;
      const R = Math.min(w, h) * 0.21;
      for (const [i, [x, y, rot]] of spots.entries()) {
        const local = clamp01((k - i * 0.12) / 0.12);
        if (local <= 0) continue;
        const text = words[i] ?? 'POW!';
        const bc = i === 1 ? pick(p.c1, [p.c3, PAPER]) : pick(p.c1, [PAPER, p.c3]);
        const idle = local >= 1 ? Math.sin(t * 6 + i * 2) : 0;
        const r = rot + idle * 0.06;
        const sc = back(local) * (1 + idle * 0.03);
        burstShape(ctx, x * w, y * h, R * sc, 11, bc, r, 0.74);
        const s = fitSize(ctx, text, R * 1.3, h * 0.16);
        word(ctx, text, x * w, y * h, s, pick(bc, [p.c1, p.c2, LINE], 3), r, sc);
      }
      frame(ctx, w, h);
    },
  },
  {
    id: 'skyline-run',
    label: 'Rooftop dash',
    loop: 2,
    make: (p) => (ctx, t, w, h) => {
      const sky = [p.c3, p.c1, p.c2].find((c) => luminance(c) > 0.45) ?? PAPER;
      fill(ctx, w, h, sky);
      dots(ctx, p, sky, w, h * 0.55, 12);
      // Buildings: a palette colour that contrasts with both the sky and the ink runner.
      const bldg =
        [p.c2, p.c1, p.c3, PAPER].find(
          (c) => contrast(c, sky) >= 1.6 && contrast(c, LINE) >= 2.5,
        ) ?? PAPER;
      const far =
        [p.c1, p.c2, p.c3].find(
          (c) => c !== bldg && contrast(c, sky) >= 1.3 && contrast(c, LINE) >= 2,
        ) ?? sky;
      const layers = [
        { base: 0.46, speed: 40, col: far },
        { base: 0.3, speed: 150, col: bldg },
      ];
      for (const [li, Lr] of layers.entries()) {
        const r = rng(`${p.name}${li}`);
        const widths = Array.from({ length: 12 }, () => 34 + r() * 40);
        const heights = Array.from({ length: 12 }, () => Lr.base + r() * Lr.base * 0.5);
        const total = widths.reduce((a, b) => a + b + 6, 0);
        let x = -((t * Lr.speed) % total);
        for (let rep = 0; rep < 3 && x < w; rep++) {
          for (let i = 0; i < 12 && x < w; i++) {
            const bw = widths[i] ?? 40;
            const bh = h * (heights[i] ?? 0.3);
            ctx.fillStyle = Lr.col;
            ctx.fillRect(x, h - bh, bw, bh);
            ctx.lineWidth = li ? 3.5 : 2.5;
            ctx.strokeStyle = LINE;
            ctx.strokeRect(x, h - bh, bw, bh + 4);
            x += bw + 6;
          }
        }
      }
      const phase = (t * 2.2) % 1;
      const roof = h * 0.74;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const yy = h * (0.3 + i * 0.07);
        const len = 50 + ((i * 37 + Math.floor(t * 10) * 13) % 40);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(w * 0.3 - i * 6, yy);
        ctx.lineTo(w * 0.3 - i * 6 - len, yy);
        ctx.stroke();
        ctx.strokeStyle = pick(sky, [p.c1, p.c2, p.c3], 2);
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      // Dust puff each time a foot lands.
      const land = (phase * 2) % 1;
      if (land < 0.35) {
        const q = land / 0.35;
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.arc(w * 0.42 - q * w * 0.12 - j * 8, roof - 4 - j * 3, 5 + q * 6 - j, 0, TAU);
          ctx.fillStyle = PAPER;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = LINE;
          ctx.stroke();
        }
      }
      runnerOutlined(ctx, w * 0.5, roof, h * 0.22, phase, PAPER);
      frame(ctx, w, h);
    },
  },
  {
    id: 'cover',
    label: 'Issue #1 cover',
    loop: 4,
    make: (p) => (ctx, t, w, h) => {
      fill(ctx, w, h, PAPER);
      ctx.fillStyle = p.c1;
      ctx.fillRect(0, 0, w, h * 0.24);
      const name = p.name.toUpperCase();
      const s = fitSize(ctx, name, w * 0.88, h * 0.17);
      const k = clamp01(((t % 4) - 0.05) / 0.25);
      word(
        ctx,
        name,
        w / 2,
        h * 0.13,
        s,
        pick(p.c1, [PAPER, p.c3]),
        0,
        k <= 0 ? 0.01 : 1.7 - 0.7 * back(k),
      );
      ctx.save();
      ctx.beginPath();
      ctx.rect(12, h * 0.27, w - 24, h * 0.6);
      ctx.clip();
      sunburst(ctx, w, h * 1.15, p.c2, p.c3, t * 0.25, 22, w / 2, h * 0.57);
      const R = Math.min(w, h) * 0.2 * (1 + pulse(t, 2, 0.2) * 0.08);
      const pc = plate(ctx, p, mix(p.c2, p.c3, 0.5), w / 2, h * 0.57, R);
      drawMotif(ctx, p.motif, w / 2, h * 0.57, R * 0.7, t, inkOn(p, pc), Math.sin(t) * 0.15);
      // Gloss: two opaque paper stripes sweep across the art once per loop.
      const gx = (((t % 4) / 4) * 2 - 0.5) * w * 1.6;
      ctx.fillStyle = PAPER;
      for (const [off, wd] of [
        [0, 14],
        [24, 6],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(gx + off, h * 0.27);
        ctx.lineTo(gx + off + wd, h * 0.27);
        ctx.lineTo(gx + off + wd - h * 0.3, h * 0.87);
        ctx.lineTo(gx + off - h * 0.3, h * 0.87);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = LINE;
      ctx.strokeRect(12, h * 0.27, w - 24, h * 0.6);
      const fs = Math.round(Math.min(h * 0.06, w * 0.055));
      ctx.font = `${fs}px "Russo One", sans-serif`;
      ctx.fillStyle = LINE;
      ctx.textBaseline = 'alphabetic';
      const left = `NO. 1${p.year ? ` · ${p.year}` : ''}`;
      ctx.textAlign = 'left';
      ctx.fillText(left, 16, h * 0.94);
      if (ctx.measureText(left).width + ctx.measureText('COMICMUTANT').width + 48 < w) {
        ctx.textAlign = 'right';
        ctx.fillText('COMICMUTANT', w - 16, h * 0.94);
      }
      frame(ctx, w, h);
    },
  },
  {
    id: 'faceoff',
    label: 'Face-off',
    loop: 2,
    make: (p) => (ctx, t, w, h) => {
      // Diagonal split; a paper badge and an ink badge charge in, clash (held), recoil to their corners.
      const k = (t % 2) / 2;
      const hit = 0.38;
      const hold = 0.2;
      const [sx, sy] = shake(k, hit, 0.12, 7);
      ctx.save();
      ctx.translate(sx, sy);
      const A = p.c1;
      const B = p.c2;
      fill(ctx, w + 14, h + 14, A);
      dots(ctx, p, A, w, h, 10);
      const seam = (draw: boolean) => {
        ctx.beginPath();
        ctx.moveTo(w + 10, -10);
        for (let i = 0; i <= 7; i++) {
          const q = i / 7;
          const jag = i % 2 ? 10 : -10;
          ctx.lineTo(w * (1 - q) + jag, h * q + jag * 0.4);
        }
        if (!draw) {
          ctx.lineTo(-10, h + 10);
          ctx.lineTo(w + 10, h + 10);
          ctx.closePath();
        }
      };
      ctx.save();
      seam(false);
      ctx.fillStyle = B;
      ctx.fill();
      ctx.clip();
      dots(ctx, p, B, w, h, 10);
      ctx.restore();
      seam(true);
      ctx.lineWidth = 6;
      ctx.strokeStyle = LINE;
      ctx.stroke();
      const m = Math.min(w, h);
      const r = m * 0.16;
      const approach = k < hit ? ease(k / hit) ** 1.6 : 1;
      const recoil =
        k < hit + hold ? 0 : k < 0.85 ? ease((k - hit - hold) / (0.85 - hit - hold)) : 1;
      // Separation is capped so both badges stay fully inside the frame.
      const maxSep = Math.min(w / 2 - r - 14, (h / 2 - r - 14) / 0.85);
      const sep = r * 0.72 + Math.min(maxSep - r * 0.72, (1 - approach + recoil) * m * 0.28);
      const ax = w / 2 - sep;
      const ay = h / 2 + sep * 0.85;
      const bx = w / 2 + sep;
      const by = h / 2 - sep * 0.85;
      const clash = k >= hit && k < hit + hold + 0.08;
      if (clash) {
        const q = clamp01((k - hit) / 0.08);
        burstShape(ctx, w / 2, h / 2, m * 0.4 * back(q), 14, PAPER, 0.2, 0.62);
        burstShape(
          ctx,
          w / 2,
          h / 2,
          m * 0.26 * back(q),
          12,
          pick(PAPER, [p.c3, p.c1, LINE], 3),
          -0.2,
          0.6,
        );
      }
      // One paper badge, one ink badge — never two identical plates.
      ctx.beginPath();
      ctx.arc(ax, ay, r, 0, TAU);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = LINE;
      ctx.stroke();
      drawMotif(ctx, p.motif, ax, ay, r * 0.72, t, inkOn(p, PAPER), 0.3);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fillStyle = LINE;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = PAPER;
      ctx.stroke();
      drawMotif(ctx, p.motif, bx, by, r * 0.72, t + 1, inkOn(p, LINE), -0.3);
      if (clash) {
        const text = SFX[p.motif][1] ?? 'CLASH!';
        const s = fitSize(ctx, text, w * 0.6, h * 0.2);
        word(
          ctx,
          text,
          w / 2,
          h * 0.15,
          s,
          pick(A, [p.c3, PAPER, LINE]),
          -0.08,
          back(clamp01((k - hit) / 0.06)),
        );
      }
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'headline',
    label: 'Front page',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      const k = (t % 3) / 3;
      fill(ctx, w, h, LINE);
      // Rolls in from below, off the top at the end: the loop seam is ink → ink.
      const roll = k < 0.5 ? 1 - ease(clamp01(k / 0.12)) : -ease(clamp01((k - 0.94) / 0.06));
      ctx.save();
      ctx.translate(0, roll * h);
      fill(ctx, w, h, PAPER);
      const mast = h * 0.13;
      ctx.fillStyle = p.c1;
      ctx.fillRect(0, 0, w, mast);
      ctx.fillStyle = LINE;
      ctx.fillRect(0, mast, w, 4);
      ctx.font = `${Math.round(mast * 0.55)}px Bangers, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pick(p.c1, [PAPER, LINE], 4.5);
      ctx.fillText('THE MUTANT TIMES', w / 2, mast / 2 + 1);
      // Headline on a solid paper slab with an ink rule above and below.
      const name = p.name.toUpperCase();
      const hs = fitSize(ctx, name, w * 0.9, h * 0.16);
      const slam = clamp01((k - 0.14) / 0.12);
      ctx.fillStyle = LINE;
      ctx.fillRect(w * 0.04, mast + h * 0.03, w * 0.92, 3);
      ctx.fillRect(w * 0.04, mast + h * 0.2, w * 0.92, 3);
      if (slam > 0)
        word(
          ctx,
          name,
          w / 2,
          mast + h * 0.115,
          hs,
          pick(PAPER, [p.c1, p.c2, LINE], 3),
          0,
          1.9 - 0.9 * back(slam),
        );
      // Photo: the motif cropped big inside the box (a "photo", not a badge).
      const bx = w * 0.06;
      const by = mast + h * 0.25;
      const bw = w * 0.52;
      const bh = h * 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      fill(ctx, w, h, p.c2);
      dots(ctx, p, p.c2, w, h, 7);
      // Secondary motion through the hold: the photo slowly pans and zooms (Ken Burns).
      const pan = ease(clamp01((k - 0.2) / 0.7));
      const zoom = 1 + pan * 0.14;
      const photoInk = distinct(p, p.c2, [], 3);
      // Second photo ink: a distinct colour only if it also clears 3:1; else reuse the first.
      const alt = distinct(p, p.c2, [photoInk], 3);
      const photoInk2 = contrast(alt, p.c2) >= 3 ? alt : photoInk;
      drawMotif(
        ctx,
        p.motif,
        bx + bw * (0.66 - pan * 0.14),
        by + bh * (0.64 - pan * 0.06),
        bh * 0.62 * zoom,
        t * 0.5,
        {
          c1: photoInk,
          c2: p.c2,
          c3: photoInk2,
          // Strand/outline ink flips to paper on a dark photo ground (Spider-Man's navy).
          line: contrast(LINE, p.c2) >= 3 ? LINE : PAPER,
        },
        -0.25,
      );
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = LINE;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = LINE;
      const cx = bx + bw + w * 0.05;
      const cw = w - cx - w * 0.06;
      // Columns "type in" line by line through the hold.
      const typed = clamp01((k - 0.3) / 0.55) * 9;
      for (let i = 0; i < 9; i++) {
        const lineK = clamp01(typed - i);
        if (lineK <= 0) break;
        ctx.fillRect(
          cx,
          by + bh * 0.4 + i * (bh * 0.065),
          (i % 4 === 3 ? cw * 0.6 : cw) * lineK,
          3,
        );
      }
      // EXTRA! pops over the columns and rolls off with the page (it lives inside the page).
      const pop = clamp01((k - 0.4) / 0.08);
      if (pop > 0) {
        const R = Math.min(w, h) * 0.15;
        const ex = w * 0.79;
        const ey = mast + h * 0.33;
        const bc = pick(PAPER, [p.c3, p.c1], 2);
        const wob = Math.sin(t * 7) * 0.05;
        burstShape(ctx, ex, ey, R * back(pop), 12, bc, wob, 0.72);
        const s = fitSize(ctx, 'EXTRA!', R * 1.25, h * 0.11);
        word(ctx, 'EXTRA!', ex, ey, s, pick(bc, [PAPER, LINE, p.c1], 3), -0.15 + wob, back(pop));
      }
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'cardflip',
    label: 'Trading card',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      const k = (t % 3) / 3;
      fill(ctx, w, h, p.c2);
      dots(ctx, p, p.c2, w, h, 11);
      const angle =
        k < 0.15
          ? (k / 0.15) * Math.PI
          : k < 0.85
            ? Math.PI
            : Math.PI + ((k - 0.85) / 0.15) * Math.PI;
      const sx = Math.cos(angle);
      const front = sx < 0;
      // Lands face-up with a pop.
      const land = k >= 0.15 && k < 0.25 ? 1 + Math.sin(((k - 0.15) / 0.1) * Math.PI) * 0.08 : 1;
      const cw = w * 0.56;
      const ch = h * 0.84;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(Math.max(0.04, Math.abs(sx)) * land, land);
      ctx.translate(-cw / 2, -ch / 2);
      const rim = pick(p.c2, [p.c3, PAPER, p.c1], 2);
      ctx.fillStyle = LINE;
      ctx.fillRect(-4, -4, cw + 8, ch + 8);
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, cw, ch);
      if (!front) {
        ctx.fillStyle = p.c1;
        ctx.fillRect(cw * 0.07, ch * 0.05, cw * 0.86, ch * 0.9);
        const ink = inkOn(p, p.c1);
        for (let row = 0; row < 4; row++)
          for (let col = 0; col < 2; col++)
            drawMotif(
              ctx,
              p.motif,
              cw * (0.3 + col * 0.4),
              ch * (0.17 + row * 0.22),
              cw * 0.12,
              t,
              ink,
              row * 0.5,
            );
      } else {
        const ax = cw * 0.07;
        const ay = ch * 0.05;
        const aw = cw * 0.86;
        const ah = ch * 0.48;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ax, ay, aw, ah);
        ctx.clip();
        sunburst(ctx, cw, ch, p.c1, p.c2, t * 0.4, 16, cw / 2, ay + ah / 2);
        // Art: the motif cropped large, bleeding off the art box.
        const art = mix(p.c1, p.c2, 0.5);
        const pc = plate(ctx, p, art, cw * 0.56, ay + ah * 0.56, aw * 0.36);
        drawMotif(ctx, p.motif, cw * 0.56, ay + ah * 0.56, aw * 0.26, t, inkOn(p, pc), -0.2);
        ctx.restore();
        ctx.lineWidth = 3;
        ctx.strokeStyle = LINE;
        ctx.strokeRect(ax, ay, aw, ah);
        const name = p.name.toUpperCase();
        ctx.fillStyle = LINE;
        ctx.fillRect(ax, ay + ah + ch * 0.03, aw, ch * 0.1);
        ctx.font = `${Math.round(fitSize(ctx, name, aw * 0.9, ch * 0.08))}px Bangers, Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PAPER;
        ctx.fillText(name, cw / 2, ay + ah + ch * 0.08);
        const fillK = ease(clamp01((k - 0.2) / 0.3));
        const vals = [0.85, 0.6, 0.95];
        const labels = ['PWR', 'SPD', 'IQ'];
        const textC = pick(rim, [LINE, PAPER], 4.5);
        for (let i = 0; i < 3; i++) {
          const y = ay + ah + ch * (0.17 + i * 0.075);
          ctx.font = `${Math.round(ch * 0.065)}px "Russo One", sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillStyle = textC;
          ctx.fillText(labels[i] ?? '', ax, y + ch * 0.028);
          const bx = ax + aw * 0.32;
          const bw = aw * 0.68;
          ctx.fillStyle = LINE;
          ctx.fillRect(bx, y, bw, ch * 0.05);
          ctx.fillStyle = pick(LINE, [p.c1, p.c3, PAPER], 2.5);
          ctx.fillRect(bx + 2, y + 2, (bw - 4) * (vals[i] ?? 0.5) * fillK, ch * 0.05 - 4);
        }
        // Holo glint: a wide ink-keyed stripe in the accent colour sweeping across the whole card.
        if (k > 0.5 && k < 0.8) {
          const gx = ((k - 0.5) / 0.3) * (cw + ch * 0.6) - ch * 0.1;
          // A highlight is lighter than the card face; failing that, a paper core with palette edges.
          const lit = [p.c3, p.c1, p.c2].find(
            (c) =>
              luminance(c) > luminance(rim) + 0.12 &&
              luminance(c) > 0.18 &&
              contrast(c, rim) >= 1.6,
          );
          const glint = lit ?? PAPER;
          const edge = lit
            ? LINE
            : ([p.c1, p.c3, p.c2].find((c) => contrast(c, PAPER) >= 3 && contrast(c, rim) >= 1.4) ??
              LINE);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, cw, ch);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx + cw * 0.09, 0);
          ctx.lineTo(gx + cw * 0.09 - ch * 0.5, ch);
          ctx.lineTo(gx - ch * 0.5, ch);
          ctx.closePath();
          ctx.fillStyle = glint;
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = edge;
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'bounce',
    label: 'Ricochet',
    loop: 2.4,
    make: (p) => (ctx, t, w, h) => {
      // Three ricochets per loop: travel (0.55 of each beat), then a held wall hit with squash,
      // an outside spark and the SFX word.
      const ground = pick(PAPER, [p.c2, LINE], 3);
      fill(ctx, w, h, ground);
      dots(ctx, p, ground, w, h, 11);
      const m = Math.min(w, h);
      const r = m * 0.16;
      const wall = pick(ground, [p.c1, p.c3, PAPER, LINE], 3);
      // Spark and trail take colours different from the wall, so they never merge with it.
      const plateC = pick(ground, [p.c3, PAPER, p.c1], 2.2);
      const spark = distinct(p, ground, [wall, plateC]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = wall;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      const hits = [
        { x: w - 15 - r, y: h * 0.42, nx: 1, ny: 0 },
        { x: w * 0.4, y: h - 15 - r, nx: 0, ny: 1 },
        { x: 15 + r, y: h * 0.38, nx: -1, ny: 0 },
      ];
      const beat = (t % 2.4) / 0.8;
      const i = Math.floor(beat);
      const u = beat - i;
      const from = hits[(i + 2) % 3] ?? hits[0];
      const to = hits[i % 3] ?? hits[0];
      if (!from || !to) return;
      const travel = clamp01(u / 0.55);
      const e = travel ** 1.5;
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e;
      const held = u >= 0.55;
      // Motion trail: spaced, shrinking rings (not stacked discs) behind the direction of travel.
      if (!held) {
        const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const ux = (to.x - from.x) / dist;
        const uy = (to.y - from.y) / dist;
        const gone = Math.hypot(x - from.x, y - from.y);
        for (let j = 1; j <= 3; j++) {
          const off = j * r * 1.15;
          if (off > gone) break;
          const rad = r * (0.62 - j * 0.14);
          ctx.beginPath();
          ctx.arc(x - ux * off, y - uy * off, rad, 0, TAU);
          ctx.lineWidth = 7;
          ctx.strokeStyle = LINE;
          ctx.stroke();
          ctx.lineWidth = 4;
          ctx.strokeStyle = spark;
          ctx.stroke();
        }
      }
      let sqN = 0;
      if (held) {
        const q = (u - 0.55) / 0.45;
        sqN = Math.sin(Math.min(1, q * 1.5) * Math.PI) * 0.3;
        // Spark fans inward from the wall (centred on the ball side, sized to stay inside the frame).
        const spx = to.x - to.nx * r * 0.35;
        const spy = to.y - to.ny * r * 0.35;
        // Half-fan: clipped to the arena so it never spills through the wall.
        ctx.save();
        ctx.beginPath();
        ctx.rect(15, 15, w - 30, h - 30);
        ctx.clip();
        // Spark and word scale out over the end of the hold instead of vanishing in one frame.
        const outQ = 1 - ease(clamp01((q - 0.82) / 0.18));
        if (outQ > 0.02)
          burstShape(ctx, spx, spy, r * (1.4 + (1 - q) * 0.3) * outQ, 12, spark, t * 4, 0.55);
        ctx.restore();
        const text = SFX[p.motif][2] ?? 'BONK!';
        word(
          ctx,
          text,
          w / 2,
          h * 0.17,
          fitSize(ctx, text, w * 0.45, h * 0.15),
          pick(ground, [p.c3, PAPER, p.c1]),
          -0.08,
          back(clamp01(q * 4)) * outQ,
        );
      }
      ctx.save();
      // Squash keeps the ball against the wall: shift the centre wall-ward by the squashed amount.
      ctx.translate(x + to.nx * r * sqN, y + to.ny * r * sqN);
      ctx.scale(
        1 - Math.abs(to.nx) * sqN + Math.abs(to.ny) * sqN * 0.6,
        1 - Math.abs(to.ny) * sqN + Math.abs(to.nx) * sqN * 0.6,
      );
      const pc = plate(ctx, p, ground, 0, 0, r);
      drawMotif(ctx, p.motif, 0, 0, r * 0.72, t, inkOn(p, pc), t * 3);
      ctx.restore();
      frame(ctx, w, h);
    },
  },
  {
    id: 'radar',
    label: 'Radar lock',
    loop: 3,
    make: (p) => (ctx, t, w, h) => {
      // Sweep pings two blips, then brackets snap onto the third: LOCKED.
      const ground = [p.c2, p.c1, p.c3].find((c) => luminance(c) < 0.1) ?? LINE;
      fill(ctx, w, h, ground);
      const scope = pick(ground, [p.c3, p.c1, PAPER], 4.5);
      const k = (t % 3) / 3;
      const cx = w / 2;
      const cy = h * 0.46;
      const R = Math.min(w, h) * 0.38;
      ctx.lineWidth = 2;
      ctx.strokeStyle = scope;
      for (const f of [1, 0.66, 0.33]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * f, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();
      const locked = k > 0.62;
      const a = locked ? 2.2 + 0.05 : (k / 0.62) * (2.2 + Math.PI / 2 + 0.05) - Math.PI / 2;
      if (!locked) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a - 0.9, a);
        ctx.closePath();
        ctx.clip();
        halftone(ctx, w, h, scope, 7, -0.4);
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a - 0.1, a);
        ctx.closePath();
        ctx.fillStyle = scope;
        ctx.fill();
      }
      const blips = [
        [-0.9, 0.62],
        [0.5, 0.78],
        [2.2, 0.5],
      ] as const;
      for (const [i, [ba, br]] of blips.entries()) {
        const bx = cx + Math.cos(ba) * R * br;
        const by = cy + Math.sin(ba) * R * br;
        const seen = a >= ba;
        if (!seen) continue;
        const since = a - ba;
        const q = clamp01(since / 1.2);
        if (q < 1 && !(i === 2 && locked)) {
          ctx.beginPath();
          ctx.arc(bx, by, R * 0.08 + q * R * 0.25, 0, TAU);
          ctx.lineWidth = 5 * (1 - q) + 1;
          ctx.strokeStyle = scope;
          ctx.stroke();
        }
        const lockK = i === 2 && locked ? back(clamp01((k - 0.62) / 0.08)) : 0;
        // Loop seam: everything that appeared scales out over the last 0.08 (no translucency).
        const out = 1 - ease(clamp01((k - 0.92) / 0.08));
        if (out <= 0.01) continue;
        const rr =
          R *
          (i === 2 ? 0.17 + lockK * 0.18 : 0.11) *
          // The sweep stops on the target at lock, so the lock pop (not elapsed sweep) sizes it.
          Math.max(back(clamp01(since * 3)), lockK) *
          out *
          (1 + (lockK ? pulse(t, 0.5, 0.4) * 0.08 : 0));
        const pc = plate(
          ctx,
          { ...p, c3: pick(ground, [p.c3, PAPER, p.c1], 4.5) },
          ground,
          bx,
          by,
          rr,
        );
        drawMotif(ctx, p.motif, bx, by, rr * 0.7, t + i, inkOn(p, pc));
        if (i === 2 && locked) {
          // Brackets snap in from wide to tight.
          const snap = back(clamp01((k - 0.62) / 0.08));
          // Strokes scale with the target so each arm stays ≥2.5× the widest stroke:
          // brackets read as four corners, never blobs or a closed box.
          const g = rr * (1.9 - snap * 0.6);
          const arm = rr * 0.5;
          const kw = Math.min(11, Math.max(3, rr * 0.16));
          const key = luminance(ground) < 0.2 ? PAPER : LINE;
          const accent = distinct(p, ground, [key], 3);
          for (const [col, wd] of [
            [key, kw],
            [accent, kw * 0.6],
          ] as const) {
            ctx.lineWidth = wd;
            ctx.strokeStyle = col;
            ctx.lineCap = 'square';
            for (const [dx, dy] of [
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ] as const) {
              ctx.beginPath();
              ctx.moveTo(bx + dx * g, by + dy * (g - arm));
              ctx.lineTo(bx + dx * g, by + dy * g);
              ctx.lineTo(bx + dx * (g - arm), by + dy * g);
              ctx.stroke();
            }
          }
        }
      }
      const label = locked ? 'LOCKED!' : `SCANNING: ${p.name.toUpperCase()}`;
      word(
        ctx,
        label,
        w / 2,
        h * 0.92,
        fitSize(ctx, label, w * 0.86, h * (locked ? 0.13 : 0.09)),
        scope,
        locked ? -0.04 : 0,
        (locked ? back(clamp01((k - 0.62) / 0.06)) : 1) * (1 - ease(clamp01((k - 0.92) / 0.08))),
      );
      frame(ctx, w, h);
    },
  },
  {
    id: 'shatter',
    label: 'Glass break',
    loop: 2.4,
    make: (p) => (ctx, t, w, h) => {
      // A bevelled glass pane cracks, shatters, and reveals the name stamped on motif wallpaper.
      const k = (t % 2.4) / 2.4;
      // Short idle → crack → burst; the name payoff gets the long hold.
      const crack = 0.1;
      const burst = 0.26;
      const [sx, sy] = shake(k, burst, 0.12, 6);
      ctx.save();
      ctx.translate(sx, sy);
      const m = Math.min(w, h);
      // Behind the glass: motif wallpaper + the name.
      fill(ctx, w + 12, h + 12, p.c2);
      const wall = inkOn(p, p.c2);
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++)
          drawMotif(
            ctx,
            p.motif,
            w * (0.12 + col * 0.25 + (row % 2) * 0.12),
            h * (0.12 + row * 0.25),
            m * 0.07,
            t,
            wall,
            (row + col) * 0.6,
          );
      const name = p.name.toUpperCase();
      const ns = fitSize(ctx, name, w * 0.68, h * 0.2);
      const nk = k < burst ? 0.6 : back(clamp01((k - burst) / 0.15));
      ctx.fillStyle = PAPER;
      // Plate inset well inside the frame.
      ctx.fillRect(w * 0.09, h * 0.5 - ns * 0.62, w * 0.82, ns * 1.24);
      ctx.lineWidth = 4;
      ctx.strokeStyle = LINE;
      ctx.strokeRect(w * 0.09, h * 0.5 - ns * 0.62, w * 0.82, ns * 1.24);
      word(ctx, name, w / 2, h / 2, ns, pick(PAPER, [p.c1, p.c2, LINE], 3), -0.03, nk);
      // The pane.
      const ix = w * 0.62;
      const iy = h * 0.4;
      const rr = rng(`${p.name}glass`);
      const n = 11;
      const angles = Array.from({ length: n }, (_, i) => (i / n) * TAU + rr() * 0.35).sort(
        (x, y) => x - y,
      );
      // Shards clear by ~0.5; the clean name holds until the pane wipes back in at 0.92.
      const fly = k < burst ? 0 : Math.min(1, ((k - burst) / 0.24) ** 0.9);
      const pane = p.c1;
      const drawGlass = () => {
        // Over-fill: flying shards reach past the canvas edge and must carry glass to their tips.
        ctx.fillStyle = pane;
        ctx.fillRect(-w, -h, w * 3, h * 3);
        dots(ctx, p, pane, w, h, 9);
        ctx.fillStyle = PAPER;
        for (const [off, wd] of [
          [0.12, 18],
          [0.2, 7],
          [0.7, 12],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(w * off, 0);
          ctx.lineTo(w * off + wd, 0);
          ctx.lineTo(w * off + wd - h * 0.5, h);
          ctx.lineTo(w * off - h * 0.5, h);
          ctx.closePath();
          ctx.fill();
        }
        // Bevelled rim: paper inner line inside the ink frame.
        ctx.lineWidth = 4;
        ctx.strokeStyle = PAPER;
        ctx.strokeRect(13, 13, w - 26, h - 26);
        ctx.lineWidth = 2;
        ctx.strokeStyle = LINE;
        ctx.strokeRect(19, 19, w - 38, h - 38);
      };
      if (k < burst || k >= 0.92) {
        ctx.save();
        if (k >= 0.92) {
          ctx.beginPath();
          ctx.rect(0, 0, w, h * ease((k - 0.92) / 0.08));
          ctx.clip();
        }
        drawGlass();
        if (k >= crack && k < burst) {
          const q = (k - crack) / (burst - crack);
          const Rb = Math.hypot(w, h);
          for (const ang of angles) {
            const len = Rb * 0.5 * ease(q);
            ctx.beginPath();
            ctx.moveTo(ix, iy);
            ctx.lineTo(ix + Math.cos(ang) * len * 0.5 + 5, iy + Math.sin(ang) * len * 0.5 - 4);
            ctx.lineTo(ix + Math.cos(ang) * len, iy + Math.sin(ang) * len);
            ctx.lineWidth = 7;
            ctx.strokeStyle = PAPER;
            ctx.stroke();
            ctx.lineWidth = 3;
            ctx.strokeStyle = LINE;
            ctx.stroke();
          }
          burstShape(ctx, ix, iy, m * (0.1 + q * 0.08), 10, PAPER, q, 0.5);
          const s = fitSize(ctx, 'KRAK!', w * 0.3, h * 0.12);
          word(
            ctx,
            'KRAK!',
            ix,
            iy - m * 0.24,
            s,
            pick(pane, [PAPER, LINE]),
            0.1,
            back(clamp01(q * 3)),
          );
        }
        ctx.restore();
      } else if (fly < 1) {
        const Rs = Math.hypot(w, h) * 0.6;
        for (let i = 0; i < n; i++) {
          const a0 = angles[i] ?? 0;
          let a1 = angles[(i + 1) % n] ?? 0;
          if (a1 <= a0) a1 += TAU;
          const p1x = ix + Math.cos(a0) * Rs;
          const p1y = iy + Math.sin(a0) * Rs;
          const p2x = ix + Math.cos(a1) * Rs;
          const p2y = iy + Math.sin(a1) * Rs;
          const gx = (ix + p1x + p2x) / 3;
          const gy = (iy + p1y + p2y) / 3;
          const mid = (a0 + a1) / 2;
          const dist = fly * m * (0.3 + (i % 3) * 0.15);
          ctx.save();
          ctx.translate(
            gx + Math.cos(mid) * dist,
            gy + Math.sin(mid) * dist + fly * fly * h * 0.35,
          );
          ctx.rotate(fly * (i % 2 ? 1.1 : -1.3));
          const sc = Math.max(0.05, 1 - fly * 0.95);
          ctx.scale(sc, sc);
          ctx.translate(-gx, -gy);
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(p1x, p1y);
          ctx.lineTo(p2x, p2y);
          ctx.closePath();
          // Each shard carries its piece of the glass (dots + highlight streaks), not flat colour.
          ctx.save();
          ctx.clip();
          drawGlass();
          ctx.restore();
          ctx.lineWidth = 4 / sc;
          ctx.strokeStyle = LINE;
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
      frame(ctx, w, h);
    },
  },
];

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  if (r <= 0.5) return;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.3 : r;
    const a = (i / 8) * TAU;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = LINE;
  ctx.stroke();
}

// Every recipe sees a normalised palette (two distinct fills).
for (const k of CLIP_KINDS) {
  const raw = k.make;
  k.make = (p) => raw(clipPalette(p));
}

export const CLIP_BY_ID = new Map(CLIP_KINDS.map((k) => [k.id, k]));
