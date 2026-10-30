/** Canvas HUD pieces shared by the games: health/meter bars, banners, score plates, arenas. */
import type { Fighter } from '~/lib/schema';
import { alpha, INK, lum, mixHex, PAPER } from '../engine/color';
import { clamp, hash, TAU } from '../engine/math';
import { DISPLAY_FONT } from '../sprite/backdrop';

export const HEAD_FONT = "'Russo One', 'Arial Black', sans-serif";

/** Ink-outlined lettering. */
export function inkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  align: CanvasTextAlign = 'center',
  font = DISPLAY_FONT,
) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeText(text, x + size * 0.05, y + size * 0.07);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Slanted health bar. `ghost` is the delayed damage value; dir -1 drains toward the centre from the right. */
export function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  ghost: number,
  color: string,
  dir: 1 | -1,
) {
  const skew = h * 0.6;
  const path = (x0: number, w0: number) => {
    ctx.beginPath();
    ctx.moveTo(x0 + skew, y);
    ctx.lineTo(x0 + w0 + skew, y);
    ctx.lineTo(x0 + w0, y + h);
    ctx.lineTo(x0, y + h);
    ctx.closePath();
  };
  ctx.fillStyle = INK;
  path(x - 3, w + 6);
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fill();
  const v = clamp(value, 0, 1);
  const g = clamp(ghost, 0, 1);
  const fill = (k: number, c: string) => {
    if (k <= 0) return;
    const ww = w * k;
    path(dir === 1 ? x : x + w - ww, ww);
    ctx.fillStyle = c;
    ctx.fill();
  };
  fill(g, '#ff3b30');
  fill(
    v,
    v < 0.25 ? mixHex(color, '#ff3b30', 0.5 + 0.5 * Math.sin(performance.now() / 90)) : color,
  );
  // gloss line
  ctx.fillStyle = alpha('#ffffff', 0.35);
  ctx.fillRect(x + skew * 0.7, y + 3, w * v * 0.98, h * 0.18);
}

export function banner(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  text: string,
  sub: string,
  k: number,
  color: string,
) {
  if (k <= 0) return;
  const s =
    k < 0.15
      ? 0.6 + (k / 0.15) * 0.5
      : k > 0.85
        ? 1.1 - ((k - 0.85) / 0.15) * 0.4
        : 1.1 - (k - 0.15) * 0.14;
  const a = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = alpha(INK, 0.55);
  ctx.fillRect(0, H * 0.36, W, H * 0.24);
  ctx.translate(W / 2, H * 0.47);
  ctx.rotate(-0.05);
  ctx.scale(s, s);
  inkText(ctx, text, 0, 0, 86, color);
  if (sub) inkText(ctx, sub, 0, 58, 30, '#ffffff', 'center', HEAD_FONT);
  ctx.restore();
}

export function plate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
) {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 4, y + 4, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

/** Readable text colour on a fill. */
export const onFill = (c: string) => (lum(c) > 0.35 ? INK : '#ffffff');

/** Stylised night-city arena with two-tone sky from both fighters' palettes; cached per matchup. */
const arenaCache = new Map<string, HTMLCanvasElement | null>();
export function arenaLayer(
  p1: Fighter,
  p2: Fighter,
  W: number,
  H: number,
  ground: number,
  kind: 'city' | 'court' | 'pitch',
) {
  const key = `${p1.slug}|${p2.slug}|${kind}|${W}|${H}`;
  if (arenaCache.has(key)) return arenaCache.get(key) ?? null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const a = p1.theme.palette;
  const b = p2.theme.palette;
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, mixHex(INK, a.c2 === PAPER || lum(a.c2) > 0.5 ? a.c1 : a.c2, 0.45));
  g.addColorStop(1, mixHex(INK, b.c2 === PAPER || lum(b.c2) > 0.5 ? b.c1 : b.c2, 0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // halftone moon + sunburst
  ctx.fillStyle = alpha('#ffffff', 0.06);
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * TAU;
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.3);
    ctx.lineTo(W / 2 + Math.cos(a0) * W, H * 0.3 + Math.sin(a0) * W);
    ctx.lineTo(W / 2 + Math.cos(a0 + 0.17) * W, H * 0.3 + Math.sin(a0 + 0.17) * W);
    ctx.fill();
  }
  ctx.fillStyle = alpha('#ffffff', 0.12);
  for (let y = 0; y < ground; y += 9)
    for (let x = (y / 9) % 2 ? 4 : 0; x < W; x += 9) {
      const d = Math.hypot(x - W * 0.5, y - H * 0.28);
      const r = clamp(3.4 - d / 70, 0, 3.4);
      if (r > 0.3) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
  if (kind === 'city') {
    for (const [layer, col, hmax] of [
      [0, mixHex(INK, a.c1, 0.18), 220],
      [1, mixHex(INK, b.c1, 0.1), 150],
    ] as const) {
      ctx.fillStyle = col;
      let x = -20;
      let i = layer * 50;
      while (x < W + 40) {
        const bw = 50 + hash(i) * 70;
        const bh = 60 + hash(i + 1) * hmax;
        ctx.fillRect(x, ground - bh, bw, bh);
        ctx.fillStyle = alpha(i % 2 ? a.c3 : b.c3, 0.55);
        for (let wy = ground - bh + 12; wy < ground - 10; wy += 18)
          for (let wx = x + 8; wx < x + bw - 10; wx += 14)
            if (hash(wx * 3 + wy) > 0.55) ctx.fillRect(wx, wy, 6, 8);
        ctx.fillStyle = col;
        x += bw + 4;
        i++;
      }
    }
  } else {
    // stands with a crowd of dots
    ctx.fillStyle = mixHex(INK, '#ffffff', 0.08);
    ctx.fillRect(0, ground - 150, W, 150);
    for (let i = 0; i < 260; i++) {
      const x = hash(i) * W;
      const y = ground - 140 + hash(i + 1) * 110;
      ctx.fillStyle = [a.c1, b.c1, a.c3, b.c3, '#ffffff'][i % 5] ?? '#fff';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 3 + hash(i + 2) * 2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.fillRect(0, ground - 34, W, 34);
    ctx.fillStyle = alpha('#ffffff', 0.1);
    for (let x = 0; x < W; x += 120) ctx.fillRect(x + 10, ground - 28, 100, 20);
  }
  // floor
  const fg = ctx.createLinearGradient(0, ground, 0, H);
  const floor =
    kind === 'pitch'
      ? '#2f8f46'
      : kind === 'court'
        ? '#2b6f8f'
        : mixHex(INK, mixHex(a.c2, b.c2, 0.5), 0.35);
  fg.addColorStop(0, mixHex(floor, '#ffffff', 0.08));
  fg.addColorStop(1, mixHex(floor, INK, 0.35));
  ctx.fillStyle = fg;
  ctx.fillRect(0, ground, W, H - ground);
  if (kind === 'pitch') {
    for (let x = 0; x < W; x += 80) {
      ctx.fillStyle = alpha('#000000', 0.08);
      if ((x / 80) % 2) ctx.fillRect(x, ground, 80, H - ground);
    }
  }
  ctx.strokeStyle = alpha(INK, 0.4);
  ctx.lineWidth = 2;
  for (let x = -W; x < W * 2; x += 80) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + (x - W / 2) * 0.6, ground);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(W, ground);
  ctx.stroke();
  arenaCache.set(key, c);
  return c;
}
