/**
 * Comic-panel backdrops and lettering for sprite clips: sunburst, halftone, motif decor, floor,
 * speed/focus lines, burst lettering, confetti, dust, and the inked frame. Pure for a given t.
 */
import type { Fighter } from '~/lib/schema';
import { alpha, INK, lum, mixHex, PAPER } from '../engine/color';
import { clamp, hash, TAU } from '../engine/math';
import { AURA, type Palette, star4 } from './fx';
import type { PoseId } from './poses';

export const groundY = (h: number) => Math.round(h * 0.84);

export const DISPLAY_FONT = "'Bangers', 'Impact', 'Arial Black', sans-serif";

const patterns = new Map<string, CanvasPattern | null>();
/** Cached halftone dot tile (one per colour). Returns null where no DOM canvas exists (tests). */
function halftone(
  ctx: CanvasRenderingContext2D,
  color: string,
  size: number,
): CanvasPattern | null {
  const key = `${color}${size}`;
  if (patterns.has(key)) return patterns.get(key) ?? null;
  let pat: CanvasPattern | null = null;
  if (typeof document !== 'undefined' && typeof ctx.createPattern === 'function') {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.22, 0, TAU);
      g.fill();
      pat = ctx.createPattern(c, 'repeat');
    }
  }
  patterns.set(key, pat);
  return pat;
}

export function bgColors(f: Fighter) {
  const { c1, c2 } = f.theme.palette;
  const dark = f.theme.mood === 'dark';
  const base = dark ? mixHex(INK, lum(c2) < 0.05 ? c1 : c2, 0.22) : mixHex(PAPER, c1, 0.12);
  return {
    dark,
    base,
    ray: dark ? alpha(c1, 0.13) : alpha(c2 === PAPER ? c1 : c2, 0.12),
    dot: dark ? alpha(c1, 0.5) : alpha(INK, 0.22),
  };
}

/**
 * Static raster layers, cached as bitmaps per (fighter, size, device scale): re-rastering the
 * halftone pattern and the radial glow every frame for every clip dominated canvas time.
 */
const layers = new Map<string, HTMLCanvasElement | null>();
const LAYER_MAX = 96;
function layer(
  ctx: CanvasRenderingContext2D,
  key: string,
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D) => void,
): HTMLCanvasElement | null {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const s = (m && Math.abs(m.a)) || 1;
  const k = `${key}|${w}|${h}|${s.toFixed(2)}`;
  if (layers.has(k)) return layers.get(k) ?? null;
  let out: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext('2d');
    if (g) {
      g.scale(s, s);
      paint(g);
      out = c;
    }
  }
  if (layers.size >= LAYER_MAX) layers.clear();
  layers.set(k, out);
  return out;
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  key: string,
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D) => void,
) {
  const c = layer(ctx, key, w, h, paint);
  if (c) ctx.drawImage(c, 0, 0, w, h);
  else paint(ctx); // no DOM (tests): draw directly
}

export function backdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: Fighter,
  t: number,
  pose: PoseId,
) {
  const pal = f.theme.palette;
  const c = bgColors(f);
  ctx.fillStyle = c.base;
  ctx.fillRect(0, 0, w, h);
  // sunburst (animated: one cheap path)
  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = Math.hypot(w, h);
  ctx.fillStyle = c.ray;
  ctx.beginPath();
  const n = 16;
  const rot = t * 0.12;
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * TAU;
    const a1 = a0 + (TAU / n) * 0.5;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    ctx.closePath();
  }
  ctx.fill();
  // halftone corners + glow behind the figure: static → cached bitmap
  drawLayer(ctx, `bd|${f.slug}|${pal.c1}|${pal.c2}|${f.theme.mood}`, w, h, (g) => {
    const pat = halftone(g, c.dot, Math.max(7, Math.round(w / 30)));
    if (pat) {
      g.save();
      g.fillStyle = pat;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w * 0.55, 0);
      g.lineTo(0, h * 0.62);
      g.closePath();
      g.moveTo(w, h);
      g.lineTo(w * 0.4, h);
      g.lineTo(w, h * 0.3);
      g.closePath();
      g.globalAlpha = 0.45;
      g.fill();
      g.restore();
    }
    if (typeof g.createRadialGradient === 'function') {
      const gr = g.createRadialGradient(cx, h * 0.6, 0, cx, h * 0.6, h * 0.55);
      gr.addColorStop(0, alpha(c.dark ? pal.c1 : '#ffffff', c.dark ? 0.32 : 0.6));
      gr.addColorStop(1, alpha(c.dark ? pal.c1 : '#ffffff', 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  });
  motifDecor(ctx, w, h, f, t);
  if (pose === 'ko' || pose === 'hurt') {
    ctx.fillStyle = alpha(INK, 0.12);
    ctx.fillRect(0, 0, w, h);
  }
}

/** Faint motif-family texture so 100 themes don't all look alike. */
function motifDecor(ctx: CanvasRenderingContext2D, w: number, h: number, f: Fighter, t: number) {
  const pal = f.theme.palette;
  const fam = AURA[f.theme.motif];
  ctx.save();
  if (fam === 'orbit') {
    for (let i = 0; i < 26; i++) {
      const tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(i) * 3) + i);
      ctx.fillStyle = alpha(i % 3 ? '#ffffff' : pal.c3, 0.25 + 0.55 * tw);
      star4(
        ctx,
        hash(i + 1) * w,
        hash(i + 2) * h * 0.7,
        (1.5 + hash(i + 3) * 3.5) * (0.6 + tw * 0.6),
        0.8,
      );
    }
  } else if (fam === 'flame') {
    for (let i = 0; i < 18; i++) {
      const ph = (t * (0.25 + hash(i) * 0.3) + hash(i + 4)) % 1;
      ctx.fillStyle = alpha(i % 2 ? pal.c1 : pal.c3, 0.55 * Math.sin(ph * Math.PI));
      ctx.beginPath();
      ctx.arc(
        hash(i + 5) * w + Math.sin(t * 2 + i) * 8,
        h * (1 - ph),
        1.5 + hash(i + 6) * 2.5,
        0,
        TAU,
      );
      ctx.fill();
    }
  } else if (fam === 'bolt') {
    ctx.strokeStyle = alpha(pal.c1, 0.14);
    ctx.lineWidth = 1;
    const off = (t * 20) % 8;
    for (let y = off; y < h; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const flick = Math.floor(t * 3) % 4 === 0;
    if (flick) {
      ctx.strokeStyle = alpha(pal.c3, 0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let x = w * (0.15 + hash(Math.floor(t * 3)) * 0.7);
      ctx.moveTo(x, 0);
      for (let y = 0; y < h * 0.5; y += h * 0.08) {
        x += (hash(y + t) - 0.5) * 24;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const x = ((hash(i) * w + t * (10 + i * 4)) % (w + 120)) - 60;
      const y = h * (0.15 + hash(i + 1) * 0.55);
      ctx.fillStyle = alpha(pal.c2 === PAPER ? INK : pal.c2, 0.18);
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + hash(i + 2) * 40, 10 + hash(i + 3) * 8, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function floorBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: Fighter,
  t: number,
  scroll: number,
  groundAt?: number,
  /** Explicit scroll distance (px); overrides t * scroll when given. */
  offset?: number,
) {
  const pal = f.theme.palette;
  const gy = groundAt ?? groundY(h);
  const dark = f.theme.mood === 'dark';
  ctx.fillStyle = dark
    ? mixHex(mixHex(INK, pal.c2, 0.45), pal.c1, 0.16)
    : mixHex(PAPER, pal.c2 === PAPER ? pal.c1 : pal.c2, 0.32);
  ctx.fillRect(0, gy, w, h - gy);
  // perspective tiles
  ctx.strokeStyle = alpha(INK, 0.35);
  ctx.lineWidth = 1.5;
  const vx = w * 0.5;
  const off = (((offset ?? t * scroll * 160) % 60) + 60) % 60;
  for (let x = -w - off; x < w * 2; x += 60) {
    ctx.beginPath();
    ctx.moveTo(vx + (x - vx) * 0.35, gy);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, gy + (h - gy) * 0.45);
  ctx.lineTo(w, gy + (h - gy) * 0.45);
  ctx.stroke();
  ctx.fillStyle = alpha('#ffffff', 0.18);
  ctx.fillRect(0, gy + 2, w, 3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(w, gy);
  ctx.stroke();
}

export function speedLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  pal: Palette,
  k: number,
) {
  ctx.save();
  for (let i = 0; i < 22; i++) {
    const y = hash(i) * h * 0.82;
    const len = (0.15 + hash(i + 1) * 0.35) * w;
    const x = w - ((t * (900 + hash(i + 2) * 600) + hash(i + 3) * w * 2) % (w * 2));
    ctx.strokeStyle = alpha(i % 3 ? '#ffffff' : pal.c3, (0.18 + hash(i + 4) * 0.35) * k);
    ctx.lineWidth = 1 + hash(i + 5) * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Radial "zoom" lines converging on the centre — impact frames. */
export function focusLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  pal: Palette,
  k: number,
) {
  if (k <= 0) return;
  ctx.save();
  const cx = w * 0.55;
  const cy = h * 0.45;
  const R = Math.hypot(w, h) * 0.6;
  ctx.fillStyle = alpha(INK, 0.55 * k);
  ctx.beginPath();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU + hash(i + Math.floor(t * 20)) * 0.08;
    const inner = R * (0.55 + hash(i + 7) * 0.25);
    const wd = 0.012 + hash(i + 9) * 0.02;
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a - wd) * R * 1.3, cy + Math.sin(a - wd) * R * 1.3);
    ctx.lineTo(cx + Math.cos(a + wd) * R * 1.3, cy + Math.sin(a + wd) * R * 1.3);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = alpha(pal.c3, 0.12 * k);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

const ratio = (a: string, b: string) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Burst fill + letter colour + outline, chosen for ≥3:1 contrast. */
export function stickerColors(pal: Palette) {
  const fill = ratio(pal.c3, INK) >= 4 || ratio(pal.c3, '#ffffff') >= 4 ? pal.c3 : '#fffdf6';
  let text = INK;
  for (const c of [pal.c1, pal.c2, INK, '#ffffff']) {
    if (ratio(c, fill) >= 3) {
      text = c;
      break;
    }
  }
  const outline = ratio(text, INK) >= 3 ? INK : '#ffffff';
  return { fill, text, outline };
}

/** Font size and half-extents of a sticker, as burstWord will draw it. */
export function burstSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  shape: 'burst' | 'bubble',
  bounds?: { w: number; h: number },
) {
  const measure = (sz: number) => {
    ctx.font = `${Math.round(sz)}px ${DISPLAY_FONT}`;
    const m = typeof ctx.measureText === 'function' ? ctx.measureText(text).width : 0;
    return m > 0 ? m : sz * text.length * 0.55;
  };
  let sz = size;
  let tw = measure(sz);
  const shapeW = (tw2: number, s2: number) =>
    shape === 'burst' ? tw2 * 0.78 + s2 * 0.75 : tw2 * 0.62 + s2 * 0.55;
  if (bounds) {
    const maxRx = bounds.w * 0.42;
    if (shapeW(tw, sz) > maxRx) {
      sz *= maxRx / shapeW(tw, sz);
      tw = measure(sz);
    }
  }
  return { sz, rx: shapeW(tw, sz), ry: shape === 'burst' ? sz * 1.15 : sz * 0.9 };
}

/**
 * Lettering inside a starburst (or a speech bubble), sized so the word always fits inside the
 * shape and, given `bounds`, the shape stays inside the panel.
 */
export function burstWord(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  size: number,
  rot: number,
  pal: Palette,
  shape: 'burst' | 'bubble',
  bounds?: { w: number; h: number },
  pop = 1,
  /** Speech-bubble tail direction: -1 points down-left, 1 down-right (toward the speaker). */
  tail: 1 | -1 = -1,
) {
  if (size < 2 || pop <= 0.01) return;
  const { sz, rx, ry } = burstSize(ctx, text, size, shape, bounds);
  if (bounds) {
    x = clamp(x, rx + 8, bounds.w - rx - 8);
    y = clamp(y, ry + 8, bounds.h - ry - 8);
  }
  const col = stickerColors(pal);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(pop, pop);
  ctx.lineJoin = 'round';
  if (shape === 'burst') {
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * TAU;
      const k = i % 2 ? 0.8 : 1 + hash(i + text.length) * 0.16;
      const px = Math.cos(a) * rx * k;
      const py = Math.sin(a) * ry * k;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.save();
    ctx.translate(4, 4);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = col.fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.moveTo(tail * rx * 0.45, ry * 0.7);
    ctx.lineTo(tail * rx * 0.75, ry * 1.6);
    ctx.lineTo(tail * rx * 0.1, ry * 0.85);
    ctx.fillStyle = '#fffdf6';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 1.5, ry - 1.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.font = `${Math.round(sz)}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2.5, sz * 0.12);
  ctx.strokeStyle = shape === 'burst' ? col.outline : '#ffffff';
  ctx.strokeText(text, 0, sz * 0.05);
  ctx.fillStyle = shape === 'burst' ? col.text : INK;
  ctx.fillText(text, 0, sz * 0.05);
  ctx.restore();
}

/** Bright rays fanning up from behind a figure (victory). */
export function lightRays(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  t: number,
  pal: Palette,
) {
  ctx.save();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.24 + Math.sin(t * 0.8 + i) * 0.03;
    const wa = 0.06 + (i % 2) * 0.03;
    ctx.fillStyle = i % 2 ? alpha(pal.c3, 0.32) : alpha('#ffffff', 0.28);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a - wa) * len, y + Math.sin(a - wa) * len);
    ctx.lineTo(x + Math.cos(a + wa) * len, y + Math.sin(a + wa) * len);
    ctx.closePath();
    ctx.fill();
  }
  if (typeof ctx.createRadialGradient === 'function') {
    const g = ctx.createRadialGradient(x, y, 0, x, y, len * 0.45);
    g.addColorStop(0, alpha('#ffffff', 0.55));
    g.addColorStop(1, alpha('#ffffff', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - len, y - len, len * 2, len * 2);
  }
  ctx.restore();
}

export function confetti(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  pal: Palette,
  n: number,
) {
  const cols = [pal.c1, pal.c3, '#ffffff', pal.c2];
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  for (let i = 0; i < n; i++) {
    const sp = 0.25 + hash(i) * 0.25;
    const ph = (t * sp + hash(i + 1)) % 1;
    const x = hash(i + 2) * w + Math.sin(t * 3 + i) * 12;
    const y = -10 + ph * (h + 20);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (3 + hash(i + 3) * 4) + i);
    ctx.scale(1, Math.abs(Math.sin(t * 6 + i)) + 0.2);
    ctx.fillStyle = cols[i % cols.length] ?? '#fff';
    ctx.fillRect(-3.5, -2, 7, 4);
    ctx.strokeRect(-3.5, -2, 7, 4);
    ctx.restore();
  }
  ctx.restore();
}

/** Ground dust puff, p = 0..1 life. */
export function dust(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: number,
  pal: Palette,
  s: number,
) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  ctx.strokeStyle = alpha(INK, 0.7 * (1 - p));
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const dir = i < 3 ? -1 : 1;
    const k = (i % 3) / 3;
    const px = x + dir * (8 + p * (28 + k * 30)) * s;
    const py = y - (3 + k * 6 + p * 10) * s;
    const r = (4 + k * 3 + p * 6) * s;
    ctx.fillStyle = alpha(mixHex(pal.c2, '#ffffff', 0.6), 0.85 * (1 - p));
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function frame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  drawLayer(ctx, 'frame', w, h, (g) => {
    g.save();
    if (typeof g.createRadialGradient === 'function') {
      const gr = g.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.35,
        w / 2,
        h / 2,
        Math.hypot(w, h) * 0.6,
      );
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    const b = clamp(Math.round(Math.min(w, h) * 0.018), 3, 7);
    g.strokeStyle = INK;
    g.lineWidth = b * 2;
    g.strokeRect(0, 0, w, h);
    g.strokeStyle = alpha('#ffffff', 0.5);
    g.lineWidth = 1;
    g.strokeRect(b + 0.5, b + 0.5, w - b * 2 - 1, h - b * 2 - 1);
    g.restore();
  });
}
