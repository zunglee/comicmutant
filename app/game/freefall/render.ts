/**
 * Freefall drawing. Presentation only: reads the core, never changes it (Math.sin is fine here).
 * Two layouts share one view box (SW × VIEW_H, the POV camera in pov.ts): landscape 960×540 (box
 * centred, HUD panels either side) and portrait 540×960 (box full width, HUD bands above and below).
 * The box is identical on every device, so what you can see ahead is the same everywhere.
 */
import type { Fighter } from '~/lib/schema';
import { alpha, INK, lum, mixHex, PAPER } from '../engine/color';
import type { FxWorld } from '../engine/fx';
import { clamp, hash, TAU } from '../engine/math';
import { HEAD_FONT, inkText, plate } from '../shell/hud';
import { DISPLAY_FONT } from '../sprite/backdrop';
import { type FreefallCore, LANES, MAX_HEARTS, SW, VIEW_H } from './core';
import { fmt, LEVEL_LABEL } from './maths';
import { drawWorld } from './pov';

export interface Layout {
  W: number;
  H: number;
  portrait: boolean;
  /** Canvas units per world unit inside the shaft. */
  k: number;
  /** Shaft origin on the canvas. */
  ox: number;
  oy: number;
}

export const LANDSCAPE: Layout = {
  W: 960,
  H: 540,
  portrait: false,
  k: 540 / VIEW_H,
  ox: (960 - SW * (540 / VIEW_H)) / 2,
  oy: 0,
};
export const PORTRAIT: Layout = { W: 540, H: 960, portrait: true, k: 1, ox: 0, oy: 150 };

/** Things the view tracks between steps (interpolation + flourishes). */
export interface ViewState {
  /** Camera depth / hero x, interpolated. */
  depth: number;
  x: number;
  /** Seconds since start, for animation. */
  t: number;
  /** 0..1 flash of the question card when a new sum appears. */
  qFlash: number;
  /** Last slab result shown under the card: text + colour + time left. */
  note: { text: string; color: string; life: number } | null;
  /** "GO!" banner time left. */
  go: number;
  hurt: number;
  /** Diving this frame (speed streaks). */
  dive: boolean;
  /** Reduced motion: no tumble, pulse or streaks. */
  reduced: boolean;
  /** Paused: the sum and its answers are hidden (no free thinking time). */
  hidden: boolean;
}

const DUST = '#f2994a';
const BAD = '#ff4d5e';

function sky(f: Fighter) {
  const { c1, c2 } = f.theme.palette;
  const deep = mixHex(INK, lum(c2) < 0.05 ? c1 : c2, 0.28);
  return { deep, glow: mixHex(deep, DUST, 0.45) };
}

/** Screen-space background: dusk sky, a burning skyline that drifts with depth, smoke. */
function backdrop(ctx: CanvasRenderingContext2D, L: Layout, f: Fighter, v: ViewState) {
  const s = sky(f);
  const g = ctx.createLinearGradient(0, 0, 0, L.H);
  g.addColorStop(0, s.deep);
  g.addColorStop(0.7, s.glow);
  g.addColorStop(1, mixHex(s.glow, '#ffcf6b', 0.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
  // Distant towers (rising past as you fall: slow parallax).
  const par = v.depth * 0.08;
  for (let i = 0; i < 14; i++) {
    const w = 40 + hash(i) * 70;
    const x = ((hash(i + 3) * L.W * 1.4 + i * 37) % (L.W + w)) - w / 2;
    const top =
      ((L.H * 1.6 - ((par * (0.6 + hash(i + 7))) % (L.H * 2.2)) + hash(i + 9) * L.H) %
        (L.H * 2.2)) -
      L.H * 0.3;
    ctx.fillStyle = alpha(INK, 0.35 + hash(i + 1) * 0.3);
    ctx.fillRect(x, top, w, L.H * 1.4);
    // Lit windows.
    ctx.fillStyle = alpha('#ffd27a', 0.35);
    for (let wy = 10; wy < L.H * 1.2; wy += 22)
      for (let wx = 6; wx < w - 8; wx += 14)
        if (hash(i * 97 + wx * 3 + wy) > 0.72) ctx.fillRect(x + wx, top + wy, 5, 8);
  }
  // Smoke puffs.
  for (let i = 0; i < 8; i++) {
    const y = L.H - ((v.depth * 0.25 + hash(i) * 900) % (L.H + 200)) + 100;
    const x = hash(i + 20) * L.W;
    ctx.fillStyle = alpha('#2a2230', 0.25);
    ctx.beginPath();
    ctx.arc(x, y, 60 + hash(i + 5) * 60, 0, TAU);
    ctx.fill();
  }
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, full: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 20, s / 20);
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(-14, -3, -9, -15, 0, -7);
  ctx.bezierCurveTo(9, -15, 14, -3, 0, 7);
  ctx.closePath();
  ctx.fillStyle = full ? BAD : alpha('#ffffff', 0.15);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** The question card: the sum, then its three answers in lane order (left · middle · right). */
function card(
  ctx: CanvasRenderingContext2D,
  core: FreefallCore,
  v: ViewState,
  f: Fighter,
  x: number,
  y: number,
  w: number,
  laneXs: number[],
) {
  const g = core.gate;
  const { c3 } = f.theme.palette;
  const h = 150;
  plate(ctx, x, y, w, h, PAPER);
  ctx.fillStyle = INK;
  ctx.font = `13px ${HEAD_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('FLY THROUGH THE ANSWER', x + 12, y + 10);
  if (!g) return;
  if (v.hidden) {
    inkText(ctx, 'PAUSED', x + w / 2, y + 70, 40, c3, 'center', HEAD_FONT);
    return;
  }
  const s = 1 + v.qFlash * 0.25;
  ctx.save();
  ctx.translate(x + w / 2, y + 58);
  ctx.scale(s, s);
  // "? + 6 = 27" already carries its own = and ?.
  const text = g.q.text.includes('=') ? g.q.text : `${g.q.text} = ?`;
  // Russo One, not the condensed display face: "+", "=" and "−" need room to be told apart.
  let size = 40;
  ctx.font = `${size}px ${HEAD_FONT}`;
  while (size > 22 && ctx.measureText(text).width > w - 30) {
    size -= 2;
    ctx.font = `${size}px ${HEAD_FONT}`;
  }
  inkText(ctx, text, 0, 0, size, c3, 'center', HEAD_FONT);
  ctx.restore();
  // Lane chips: positioned under their lanes where possible.
  g.q.options.forEach((n, i) => {
    const cx = laneXs[i] as number;
    ctx.fillStyle = INK;
    ctx.fillRect(cx - 34, y + 98, 68, 38);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 32, y + 100, 64, 34);
    ctx.font = `24px ${HEAD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.fillText(fmt(n), cx, y + 118);
  });
  // How far to the slab.
  const dist = clamp((g.y - core.depth) / (core.cruise * core.think), 0, 1);
  ctx.fillStyle = alpha(INK, 0.2);
  ctx.fillRect(x + 12, y + h - 8, w - 24, 4);
  ctx.fillStyle = dist < 0.3 ? BAD : INK;
  ctx.fillRect(x + 12, y + h - 8, (w - 24) * dist, 4);
}

function stats(
  ctx: CanvasRenderingContext2D,
  core: FreefallCore,
  x: number,
  y: number,
  align: CanvasTextAlign,
  big: number,
) {
  for (let i = 0; i < MAX_HEARTS; i++) {
    const hx = align === 'right' ? x - i * 30 - 14 : x + i * 30 + 14;
    heart(ctx, hx, y + 14, 26, i < core.hearts);
  }
  inkText(
    ctx,
    core.score.toLocaleString('en-IN'),
    x,
    y + 34 + big / 2,
    big * 0.85,
    '#ffffff',
    align,
    HEAD_FONT, // clear digits (the display face's 7 reads as a 1)
  );
  ctx.font = `15px ${HEAD_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = PAPER;
  ctx.fillText(`Floor ${core.floors}  ·  ${core.correct}/${core.asked} right`, x, y + 44 + big);
  if (core.streak >= 2) {
    ctx.fillStyle = '#ffd400';
    ctx.fillText(`Streak ×${core.streak}`, x, y + 66 + big);
  }
}

export function draw(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  core: FreefallCore,
  f: Fighter,
  fx: FxWorld,
  v: ViewState,
  reduced: boolean,
  touch = false,
) {
  backdrop(ctx, L, f, v);

  // The POV view of the shaft, in the view box's units.
  ctx.save();
  const o = fx.offset();
  ctx.translate(L.ox + o.x, L.oy + o.y);
  ctx.scale(L.k, L.k);
  ctx.beginPath();
  ctx.rect(0, 0, SW, VIEW_H);
  ctx.clip();
  drawWorld(ctx, core, f, v, reduced);
  fx.drawParticles(ctx);
  fx.drawPops(ctx, DISPLAY_FONT);
  ctx.restore();

  // Shaft frame.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(L.ox, L.oy, SW * L.k, VIEW_H * L.k);

  // HUD.
  const laneX = (i: number) => L.ox + (LANES[i] as number) * L.k;
  if (L.portrait) {
    ctx.fillStyle = alpha(INK, 0.6);
    ctx.fillRect(0, 0, L.W, L.oy);
    ctx.fillRect(0, L.oy + VIEW_H, L.W, L.H - L.oy - VIEW_H);
    card(ctx, core, v, f, 8, 0, L.W - 16, [0, 1, 2].map(laneX));
    stats(ctx, core, 14, L.oy + VIEW_H + 8, 'left', 40);
    ctx.font = `14px ${HEAD_FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PAPER;
    ctx.fillText(LEVEL_LABEL[core.level], L.W - 14, L.oy + VIEW_H + 12);
  } else {
    const pw = L.ox - 24;
    // Left: the sum, chips spread across the panel in lane order.
    card(
      ctx,
      core,
      v,
      f,
      12,
      70,
      pw,
      [0, 1, 2].map((i) => 12 + pw * (0.2 + i * 0.3)),
    );
    inkText(ctx, 'FREEFALL', 12 + pw / 2, 36, 40, f.theme.palette.c3, 'center', DISPLAY_FONT);
    // Right: hearts, score, floor.
    stats(ctx, core, L.W - 14, 30, 'right', 44);
    ctx.font = `14px ${HEAD_FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PAPER;
    ctx.fillText(LEVEL_LABEL[core.level], L.W - 14, 196);
    if (touch) {
      ctx.fillText('Drag anywhere to steer', L.W - 14, L.H - 60);
      ctx.fillText('Hold Dive / Brake', L.W - 14, L.H - 38);
    } else {
      ctx.fillText('←/→ steer · ↓ dive · ↑ brake', L.W - 14, L.H - 60);
      ctx.fillText('1 · 2 · 3 jump to a lane', L.W - 14, L.H - 38);
    }
  }

  // Result note (right/wrong) under the card.
  if (v.note && v.note.life > 0) {
    const a = clamp(v.note.life / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    const nx = L.portrait ? L.W / 2 : 12 + (L.ox - 24) / 2;
    // Portrait: near the bottom of the shaft, clear of the +points pops above the hero.
    const ny = L.portrait ? L.oy + VIEW_H - 50 : 262;
    inkText(ctx, v.note.text, nx, ny, L.portrait ? 30 : 28, v.note.color, 'center', DISPLAY_FONT);
    ctx.restore();
  }
  if (v.go > 0) {
    const a = clamp(v.go / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    inkText(ctx, 'DIVE!', L.W / 2, L.oy + VIEW_H * L.k * 0.55, 90, '#ffd400');
    ctx.restore();
  }
  fx.drawFlash(ctx, L.W, L.H);
}
