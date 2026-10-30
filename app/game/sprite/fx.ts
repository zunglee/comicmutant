/**
 * Special-move and aura FX drawn around a rig. All functions are pure for their inputs (t, u) —
 * randomness comes from `hash`, so a clip frame is the same every time it is drawn.
 * Coordinates are rig-local (feet at y = 0, facing +x); callers set the transform.
 */
import type { Fighter, Motif } from '~/lib/schema';
import { alpha, INK } from '../engine/color';
import { clamp, hash, invLerp, TAU } from '../engine/math';

export type Palette = Fighter['theme']['palette'];
export type AuraFamily = 'flame' | 'bolt' | 'orbit' | 'smoke';

export const AURA: Record<Motif, AuraFamily> = {
  flame: 'flame',
  strength: 'flame',
  bolt: 'bolt',
  tech: 'bolt',
  speed: 'bolt',
  chaos: 'bolt',
  cosmic: 'orbit',
  magic: 'orbit',
  mind: 'orbit',
  ice: 'orbit',
  water: 'orbit',
  shadow: 'smoke',
  nature: 'smoke',
  web: 'smoke',
  claw: 'smoke',
  size: 'smoke',
};

interface V {
  x: number;
  y: number;
}

/** Aura around a body spanning from the feet (y=0) to `top` (negative y), centred on cx. */
export function aura(
  ctx: CanvasRenderingContext2D,
  fam: AuraFamily,
  cx: number,
  top: number,
  halfW: number,
  t: number,
  pal: Palette,
  k: number,
  /** 'lighter' glows on dark pages; light pages need normal blending or the aura washes out. */
  blend: GlobalCompositeOperation = 'lighter',
) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = blend;
  const h = -top;
  if (fam === 'flame') {
    for (let i = 0; i < 16; i++) {
      const ph = (t * (1.3 + hash(i) * 0.6) + hash(i + 9)) % 1;
      const side = hash(i + 3) * 2 - 1;
      const x = cx + side * halfW * (1.05 - ph * 0.5) + Math.sin(t * 9 + i) * 2;
      const y = -ph * h * 1.05;
      const r = (7 + hash(i + 5) * 7) * (1 - ph * 0.7) * k;
      ctx.fillStyle = alpha(i % 3 === 0 ? pal.c3 : pal.c1, (1 - ph) * 0.75 * k);
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.quadraticCurveTo(x - r * 0.6, y - r * 2.2, x, y - r * 3);
      ctx.quadraticCurveTo(x + r * 0.6, y - r * 2.2, x + r, y);
      ctx.arc(x, y, r, 0, Math.PI);
      ctx.fill();
    }
  } else if (fam === 'bolt') {
    const seed = Math.floor(t / 0.07);
    ctx.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      const s = seed * 7 + i * 13;
      let x = cx + (hash(s) * 2 - 1) * halfW * 1.2;
      let y = -hash(s + 1) * h * 0.2;
      const pts: V[] = [{ x, y }];
      for (let j = 0; j < 6; j++) {
        x += (hash(s + j * 3) - 0.5) * 22;
        y -= h / 7;
        pts.push({ x, y });
      }
      for (const [w, c] of [
        [6, alpha(pal.c1, 0.55 * k)],
        [2.2, alpha('#ffffff', 0.95 * k)],
      ] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (const [n, p] of pts.entries()) {
          if (n) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
    // static crackle sparks at the feet
    for (let i = 0; i < 8; i++) {
      const ph = (t * 2 + hash(i)) % 1;
      ctx.fillStyle = alpha(pal.c3, (1 - ph) * k);
      ctx.fillRect(cx + (hash(i + 2) * 2 - 1) * halfW * 1.6, -ph * 30, 2.5, 2.5);
    }
  } else if (fam === 'orbit') {
    ctx.strokeStyle = alpha(pal.c1, 0.5 * k);
    ctx.lineWidth = 2;
    for (let ring = 0; ring < 2; ring++) {
      ctx.beginPath();
      ctx.ellipse(
        cx,
        top * (0.45 + ring * 0.2),
        halfW * (1.7 - ring * 0.3),
        9 - ring * 2,
        0,
        0,
        TAU,
      );
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = t * (1.8 + (i % 3) * 0.4) + (i / 12) * TAU;
      const ring = i % 2;
      const x = cx + Math.cos(a) * halfW * (1.7 - ring * 0.3);
      const y = top * (0.45 + ring * 0.2) + Math.sin(a) * (9 - ring * 2);
      const r = (3 + hash(i) * 3) * k * (Math.sin(a) > 0 ? 1.2 : 0.7);
      ctx.fillStyle = alpha(i % 3 ? pal.c3 : '#ffffff', 0.95 * k);
      star4(ctx, x, y, r * 1.6, r * 0.4);
    }
    // rising motes
    for (let i = 0; i < 10; i++) {
      const ph = (t * 0.8 + hash(i + 30)) % 1;
      ctx.fillStyle = alpha(pal.c1, (1 - ph) * 0.8 * k);
      ctx.beginPath();
      ctx.arc(cx + (hash(i + 31) * 2 - 1) * halfW * 1.4, -ph * h * 1.2, 2.2, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 12; i++) {
      const ph = (t * 0.7 + hash(i + 50)) % 1;
      const x = cx + (hash(i + 51) * 2 - 1) * halfW * 1.3 + Math.sin(t * 3 + i) * 6;
      const y = -ph * h * 1.15;
      const r = (8 + hash(i + 52) * 10) * (0.5 + ph) * k;
      ctx.fillStyle = alpha(i % 2 ? pal.c2 : INK, (1 - ph) * 0.4 * k);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const ph = (t * 1.1 + hash(i + 70)) % 1;
      ctx.fillStyle = alpha(pal.c1, (1 - ph) * 0.9 * k);
      ctx.beginPath();
      ctx.arc(cx + (hash(i + 71) * 2 - 1) * halfW * 1.2, -ph * h, 2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
  ctx.fill();
}

/** Glowing energy orb with a spinning star core. Used by the projectile special and by games. */
export function orb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  pal: Palette,
  trail = 0,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 5; i >= 1; i--) {
    ctx.fillStyle = alpha(pal.c1, 0.12 * (6 - i) * 0.5);
    ctx.beginPath();
    ctx.arc(x - trail * i * r * 0.9, y + Math.sin(t * 20 + i) * 1.5, r * (1 - i * 0.12), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = alpha(pal.c1, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = alpha(pal.c3, 0.95);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 9);
  ctx.fillStyle = '#ffffff';
  star4(ctx, 0, 0, r * 1.25, r * 0.32);
  ctx.rotate(Math.PI / 4);
  star4(ctx, 0, 0, r * 0.8, r * 0.25);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

/** Horizontal beam from (x,y) forward. grow 0..1 extends it; k fades it. */
export function beam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  t: number,
  pal: Palette,
  k: number,
) {
  if (k <= 0.01 || len < 2) return;
  const th = (11 + Math.sin(t * 55) * 2.5) * k;
  ctx.save();
  ctx.lineCap = 'round';
  // ink edge first so the beam reads on light pages
  ctx.strokeStyle = INK;
  ctx.lineWidth = th * 2.3 + 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.stroke();
  for (const [w, c] of [
    [th * 2.3, pal.c1],
    [th * 1.35, pal.c3],
    [th * 0.55, '#ffffff'],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  // travelling rings
  ctx.strokeStyle = alpha('#ffffff', 0.85 * k);
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 6; i++) {
    const rx = (t * 700 + i * 110) % Math.max(1, len);
    ctx.beginPath();
    ctx.ellipse(x + rx, y, th * 0.45, th * 1.5, 0, 0, TAU);
    ctx.stroke();
  }
  // muzzle flare
  ctx.fillStyle = pal.c3;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const spikes = 9;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + t * 6;
    const r = (i % 2 ? th * 0.9 : th * 2.1) * (1 + 0.15 * Math.sin(t * 40 + i));
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, th * 0.7, 0, TAU);
  ctx.fill();
  // end splash
  ctx.fillStyle = alpha(pal.c3, 0.9 * k);
  ctx.beginPath();
  ctx.arc(x + len, y, th * 1.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Charge ball growing between the hands. */
export function chargeBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  t: number,
  pal: Palette,
  blend: GlobalCompositeOperation = 'lighter',
) {
  if (k <= 0.02) return;
  const r = 4 + 9 * k + Math.sin(t * 40) * 1.2;
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.fillStyle = alpha(pal.c1, 0.5 * k);
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = alpha(pal.c3, 0.9);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, TAU);
  ctx.fill();
  // in-flowing streaks
  ctx.strokeStyle = alpha(pal.c3, 0.8 * k);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) {
    const a = hash(i + Math.floor(t * 12) * 3) * TAU;
    const d0 = 30 + hash(i + 2) * 20;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
    ctx.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ground-slam rings, debris and cracks. p = 0..1 progress since impact. */
export function shockRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  p: number,
  pal: Palette,
  reach = 190,
) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  // cracks
  ctx.strokeStyle = alpha(INK, 1 - p);
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'bevel';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    let x = cx;
    for (let i = 0; i < 5; i++) {
      x += dir * (10 + hash(i + (dir > 0 ? 9 : 0)) * 14) * Math.min(1, p * 4);
      ctx.lineTo(x, (i % 2 ? -1 : 1) * 2.5);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const q = clamp((p - k * 0.12) / 0.8, 0, 1);
    if (q <= 0 || q >= 1) continue;
    const rx = 20 + q * reach;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9 * (1 - q) + 3;
    ctx.beginPath();
    ctx.ellipse(cx, 0, rx, rx * 0.17, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = k === 1 ? pal.c1 : pal.c3;
    ctx.lineWidth = 9 * (1 - q);
    ctx.beginPath();
    ctx.ellipse(cx, 0, rx, rx * 0.17, 0, 0, TAU);
    ctx.stroke();
  }
  // debris
  for (let i = 0; i < 10; i++) {
    const vx = (hash(i) * 2 - 1) * 150;
    const vy = -(120 + hash(i + 1) * 160);
    const tt = p * 1.1;
    const x = cx + vx * tt;
    const y = Math.min(0, vy * tt + 380 * tt * tt);
    const s = 3 + hash(i + 2) * 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tt * 10 * (hash(i + 3) - 0.5));
    ctx.fillStyle = i % 3 ? pal.c2 : pal.c3;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.6);
    ctx.lineTo(s * 0.8, -s);
    ctx.lineTo(s, s * 0.7);
    ctx.lineTo(-s * 0.6, s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** Energy plough in front of a dashing body, plus streaks behind. */
export function dashCone(
  ctx: CanvasRenderingContext2D,
  front: V,
  back: V,
  h: number,
  k: number,
  t: number,
  pal: Palette,
) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = alpha(pal.c3, 0.45 * k);
  ctx.beginPath();
  ctx.moveTo(front.x - 6, front.y - h * 0.6);
  ctx.quadraticCurveTo(front.x + 34, front.y - h * 0.1, front.x - 6, front.y + h * 0.45);
  ctx.quadraticCurveTo(front.x + 14, front.y - h * 0.1, front.x - 6, front.y - h * 0.6);
  ctx.fill();
  ctx.strokeStyle = alpha(pal.c1, 0.9 * k);
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const y = back.y - h * 0.6 + hash(i) * h * 1.1;
    const len = 40 + hash(i + 4) * 80;
    const off = ((t * 900 + hash(i + 8) * 200) % 160) * 0.4;
    ctx.strokeStyle = alpha(i % 2 ? pal.c1 : '#ffffff', 0.7 * k);
    ctx.lineWidth = 1.5 + hash(i + 3) * 2.5;
    ctx.beginPath();
    ctx.moveTo(back.x - 10 - off, y);
    ctx.lineTo(back.x - 10 - off - len, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Curved hex-plated energy guard in front of a blocking body. */
export function shield(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  k: number,
  t: number,
  pal: Palette,
) {
  if (k <= 0.01) return;
  const h = -top;
  const bulge = 34;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 6, top - 4);
  ctx.quadraticCurveTo(x + bulge * 1.6, -h * 0.5, x - 6, 6);
  ctx.quadraticCurveTo(x + bulge * 0.7, -h * 0.5, x - 6, top - 4);
  ctx.closePath();
  ctx.fillStyle = alpha(pal.c3, 0.28 * k);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = alpha('#ffffff', 0.8 * k);
  ctx.lineWidth = 1.4;
  const hx = 7;
  for (let row = 0; row * hx * 1.5 < h + 20; row++) {
    for (let col = 0; col < 6; col++) {
      const cx = x - 4 + col * hx * 1.75 + (row % 2) * hx * 0.87;
      const cy = top + row * hx * 1.5;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * TAU + Math.PI / 6;
        const px = cx + Math.cos(a) * hx;
        const py = cy + Math.sin(a) * hx;
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
  // re-trace the shield outline (the current path is the last hex otherwise)
  ctx.beginPath();
  ctx.moveTo(x - 6, top - 4);
  ctx.quadraticCurveTo(x + bulge * 1.6, -h * 0.5, x - 6, 6);
  ctx.quadraticCurveTo(x + bulge * 0.7, -h * 0.5, x - 6, top - 4);
  ctx.closePath();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = alpha(pal.c3, 0.6 + 0.4 * k + 0.1 * Math.sin(t * 20));
  ctx.stroke();
  ctx.restore();
}

/** Teleport column + sparks; k = 1 - visibility. */
export function warp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  k: number,
  t: number,
  pal: Palette,
) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const w = 26 * (1 - Math.abs(k - 0.5) * 1.2);
  ctx.fillStyle = alpha(pal.c3, 0.35 * k);
  ctx.fillRect(cx - w / 2, top - 30, w, -top + 32);
  ctx.fillStyle = alpha('#ffffff', 0.7 * k);
  ctx.fillRect(cx - w / 6, top - 30, w / 3, -top + 32);
  for (let i = 0; i < 18; i++) {
    const ph = (t * 1.6 + hash(i + 90)) % 1;
    const a = hash(i + 91) * TAU;
    const d = 8 + ph * 46;
    ctx.fillStyle = alpha(i % 2 ? pal.c1 : pal.c3, (1 - ph) * k);
    star4(ctx, cx + Math.cos(a) * d, top * (0.15 + hash(i + 92) * 0.85) + Math.sin(a) * 6, 4, 1.2);
  }
  ctx.restore();
}

/** Ring flash at a point (teleport arrival, KO). */
export function ringFlash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: number,
  pal: Palette,
  size = 60,
) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  ctx.strokeStyle = alpha(pal.c3, 1 - p);
  ctx.lineWidth = 6 * (1 - p) + 1;
  ctx.beginPath();
  ctx.arc(x, y, 6 + p * size, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = alpha('#ffffff', (1 - p) * 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 2 + p * size * 0.7, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Progress helper: 0 before a, 1 after b. */
export const span = (u: number, a: number, b: number) => invLerp(a, b, u);
