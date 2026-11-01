/**
 * Freefall's point-of-view camera: a chase cam just behind and above the hero, looking straight down
 * the collapsing shaft. Slabs, rubble and falling people rush up out of the burning depths toward you.
 * Presentation only — the rules (core.ts) are the same 1-D lateral game the server replays; this just
 * projects it. Everything is drawn in the view box's own units (SW × VIEW_H, scaled by the layout).
 *
 * Projection: a point at lateral x on the "path line" (the height the hero flies at) and world depth d
 * sits at perspective scale s = CAM / (d − camera depth); s = 1 on the hero's plane, where x maps 1:1
 * across the box. Points converge on the vanishing point (VX, VY).
 */
import type { Fighter } from '~/lib/schema';
import { alpha, INK, mixHex, PAPER } from '../engine/color';
import { clamp, hash, TAU } from '../engine/math';
import { HEAD_FONT, onFill, plate } from '../shell/hud';
import { DISPLAY_FONT } from '../sprite/backdrop';
import { drawFighter, rigHeight } from '../sprite/rig';
import { FLOOR, type FreefallCore, HERO_R, LANES, SW, VIEW_H } from './core';
import { fmt } from './maths';
import type { ViewState } from './render';

/** Camera distance behind the hero, in world depth units. */
const CAM = 170;
/** Nearest / farthest depth (from the camera) that is drawn; far things fade out of the haze. */
const NEAR = 28;
const FAR = 1050;
const VX = SW / 2;
const VY = 300;
/** The height (in the box, at s = 1) the hero and everything in their path fly at. */
export const PATH_Y = 560;
const GOOD = '#3ddc84';
const BAD = '#ff4d5e';
const HAZE = '#1a1220';

export interface Proj {
  x: number;
  y: number;
  s: number;
}

/** Where world (x, depth d), at box height py on the s = 1 plane, lands on screen. */
export function project(x: number, py: number, d: number, depth: number): Proj | null {
  const dz = d - (depth - CAM);
  if (dz < NEAR) return null;
  const s = CAM / dz;
  return { x: VX + (x - VX) * s, y: VY + (py - VY) * s, s };
}

/** 0 → 1 over ~0.4 s after spawning: things emerge from the haze instead of popping in. */
const bornIn = (core: FreefallCore, born: number) => clamp((core.step - born) / 24, 0, 1);

/** 1 near, 0 at the far haze. */
const fade = (dz: number) => clamp((FAR - dz) / 380, 0, 1);

/** The shaft: dark walls converging on a burning core, floor rings and lit windows rushing past. */
function tunnel(ctx: CanvasRenderingContext2D, f: Fighter, v: ViewState, reduced: boolean) {
  const { c1, c3 } = f.theme.palette;
  ctx.fillStyle = '#120c18';
  ctx.fillRect(0, 0, SW, VIEW_H);
  // The fire far below.
  const g = ctx.createRadialGradient(VX, VY, 4, VX, VY, 260);
  g.addColorStop(0, '#ffe08a');
  g.addColorStop(0.18, '#ff8a3d');
  g.addColorStop(0.5, alpha('#a2331f', 0.6));
  g.addColorStop(1, alpha('#120c18', 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SW, VIEW_H);

  const cam = v.depth - CAM;
  const first = Math.ceil((cam + NEAR) / FLOOR) * FLOOR;
  // Far to near so near rings sit on top.
  const rings: number[] = [];
  for (let d = first; d < cam + FAR; d += FLOOR) rings.push(d);
  for (let i = rings.length - 1; i >= 0; i--) {
    const d = rings[i] as number;
    const dz = d - cam;
    const s = CAM / dz;
    const a = fade(dz);
    const l = VX - VX * s;
    const r = VX + (SW - VX) * s;
    const t = VY - VY * s;
    const b = VY + (VIEW_H - VY) * s;
    const n = Math.round(d / FLOOR);
    // Windows on the four walls between this ring and the next one in (lit by floor).
    const s2 = CAM / Math.max(NEAR, dz - FLOOR * 0.55);
    const l2 = VX - VX * s2;
    const r2 = VX + (SW - VX) * s2;
    const lit = hash(n * 3.1);
    if (lit > 0.35) {
      ctx.fillStyle = alpha(lit > 0.8 ? '#ffd27a' : '#6ec6ff', 0.18 * a);
      // Left and right walls.
      for (const [x1, x2] of [
        [l, l2],
        [r, r2],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x1, VY + (220 - VY) * s);
        ctx.lineTo(x2, VY + (220 - VY) * s2);
        ctx.lineTo(x2, VY + (420 - VY) * s2);
        ctx.lineTo(x1, VY + (420 - VY) * s);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Cracked floor ring.
    ctx.strokeStyle = alpha(n % 5 === 0 ? c3 : '#6b5d70', (n % 5 === 0 ? 0.75 : 0.45) * a);
    ctx.lineWidth = Math.max(1, 5 * s);
    ctx.strokeRect(l, t, r - l, b - t);
    if (n % 5 === 0 && s > 0.3) {
      ctx.font = `${Math.round(22 * s)}px ${HEAD_FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = alpha(PAPER, 0.6 * a);
      ctx.fillText(`F-${n}`, l + 10 * s, t + 8 * s);
    }
  }
  // Corner seams.
  ctx.strokeStyle = alpha('#3a2f40', 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x, y] of [
    [0, 0],
    [SW, 0],
    [0, VIEW_H],
    [SW, VIEW_H],
  ] as const) {
    ctx.moveTo(x, y);
    ctx.lineTo(VX + (x - VX) * 0.16, VY + (y - VY) * 0.16);
  }
  ctx.stroke();
  // Speed streaks radiating from the core.
  if (!reduced) {
    const k = v.t * (v.dive ? 2.2 : 1.2);
    for (let i = 0; i < 26; i++) {
      const ang = hash(i) * TAU;
      const p = (k + hash(i + 7)) % 1;
      const r0 = 40 + p * p * 520;
      const len = 20 + p * 90;
      ctx.strokeStyle = alpha(i % 4 ? '#ffffff' : c1, (0.08 + p * 0.3) * (v.dive ? 1 : 0.6));
      ctx.lineWidth = 1 + p * 2;
      ctx.beginPath();
      ctx.moveTo(VX + Math.cos(ang) * r0, VY + Math.sin(ang) * r0);
      ctx.lineTo(VX + Math.cos(ang) * (r0 + len), VY + Math.sin(ang) * (r0 + len));
      ctx.stroke();
    }
  }
}

/** A slab: a concrete wall across the shaft with three numbered holes in the hero's path. */
function slab(
  ctx: CanvasRenderingContext2D,
  core: FreefallCore,
  f: Fighter,
  v: ViewState,
  d: number,
  gi: number,
) {
  const g = core.gates[gi];
  if (!g) return;
  const cam = v.depth - CAM;
  const dz = d - cam;
  if (dz < NEAR || dz > FAR || d < v.depth - 15) return;
  const s = CAM / dz;
  const age = g.state === 'ahead' ? 0 : (core.step - g.at) / 60;
  if (g.state === 'ok') return; // shattered — the particles carry it
  const a = fade(dz) * (g.state === 'ahead' ? 1 : clamp(1 - age / 0.5, 0, 1));
  if (a <= 0) return;
  const P = (x: number, y: number) => [VX + (x - VX) * s, VY + (y - VY) * s] as const;
  ctx.save();
  ctx.globalAlpha = a;
  // Wall with holes (even-odd fill).
  const top = 360;
  ctx.beginPath();
  const [x0, y0] = P(0, 0);
  const [x1, y1] = P(SW, VIEW_H);
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  for (const lx of LANES) {
    const [hx0, hy0] = P(lx - g.open / 2, top);
    const [hx1, hy1] = P(lx + g.open / 2, VIEW_H);
    ctx.rect(hx0, hy0, hx1 - hx0, hy1 - hy0);
  }
  ctx.fillStyle = mixHex('#8f8a8d', HAZE, 1 - fade(dz));
  ctx.fill('evenodd');
  ctx.lineWidth = Math.max(1.5, 4 * s);
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (g.state === 'ahead') {
    // Line-up: the hole you're in now glows, and a marker shows where you'd cross the slab.
    const lane = LANES.findIndex((lx) => Math.abs(v.x - lx) <= g.open / 2);
    if (lane >= 0) {
      const lx = LANES[lane] as number;
      const [hx0, hy0] = P(lx - g.open / 2, top);
      const [hx1, hy1] = P(lx + g.open / 2, VIEW_H);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2.5, 8 * s);
      ctx.strokeRect(hx0, hy0, hx1 - hx0, hy1 - hy0);
    }
    const [mx, my] = P(v.x, PATH_Y);
    const r = Math.max(7, 26 * s);
    ctx.strokeStyle = lane >= 0 ? '#ffffff' : BAD;
    ctx.lineWidth = Math.max(2, 5 * s);
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.moveTo(mx - r * 1.6, my);
    ctx.lineTo(mx - r * 0.5, my);
    ctx.moveTo(mx + r * 0.5, my);
    ctx.lineTo(mx + r * 1.6, my);
    ctx.stroke();
  }
  // Cracks and rebar.
  ctx.strokeStyle = alpha(INK, 0.45);
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const [cx, cy] = P(hash(g.id + i) * SW, hash(g.id + i + 9) * 300);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 30 * s, cy + 40 * s);
    ctx.lineTo(cx + 10 * s, cy + 80 * s);
  }
  ctx.stroke();
  // Numbers over the holes.
  const pulse = g.state === 'ahead' && !v.reduced ? 1 + Math.sin(v.t * 6) * 0.04 : 1;
  g.q.options.forEach((n, i) => {
    const lx = LANES[i] as number;
    let fill = f.theme.palette.c3;
    if (g.state !== 'ahead') fill = i === g.q.correct ? GOOD : i === g.pick ? BAD : '#bbbbbb';
    const [px, py] = P(lx, top - 70);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s * pulse, s * pulse);
    plate(ctx, -62, -40, 124, 80, fill);
    ctx.font = `56px ${HEAD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = onFill(fill);
    ctx.fillText(v.hidden ? '?' : fmt(n), 0, 4);
    ctx.restore();
  });
  ctx.restore();
}

function rubble(ctx: CanvasRenderingContext2D, core: FreefallCore, v: ViewState, i: number) {
  const d = core.debris[i];
  if (!d) return;
  // Gone once it's behind the hero (no giant chunk smeared over the camera).
  if (d.y < v.depth - 15) return;
  const p = project(d.x, PATH_Y, d.y, v.depth);
  if (!p) return;
  const dz = CAM / p.s;
  if (dz > FAR) return;
  // Heading for you: it will be where you are now when it reaches your plane (~1.3 s out).
  const eta = (d.y - v.depth) / Math.max(1, core.vy);
  const inLane =
    !d.hit && eta > 0 && eta < 1.3 && Math.abs(d.x + d.vx * eta - v.x) < d.w / 2 + HERO_R + 6;
  ctx.save();
  ctx.globalAlpha = fade(dz) * bornIn(core, d.born) * (d.hit ? 0.35 : 1);
  ctx.translate(p.x, p.y);
  if (!v.reduced) ctx.rotate(Math.sin(v.t * (0.8 + d.spin) + d.spin * 9) * 0.5);
  ctx.scale(p.s, p.s);
  if (inLane) {
    ctx.fillStyle = alpha(BAD, 0.3 + (v.reduced ? 0.2 : 0.2 * Math.sin(v.t * 18)));
    ctx.beginPath();
    ctx.ellipse(0, 0, d.w * 0.75, (70 + d.h) * 0.75, 0, 0, TAU);
    ctx.fill();
  }
  const w = d.w;
  const h = 70 + d.h;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + hash(d.id) * 10);
  ctx.lineTo(-w / 6, -h / 2);
  ctx.lineTo(w / 5, -h / 2 + 8);
  ctx.lineTo(w / 2, -h / 2 + hash(d.id + 1) * 12);
  ctx.lineTo(w / 2 - 6, h / 2);
  ctx.lineTo(-w / 3, h / 2 - 5);
  ctx.lineTo(-w / 2 + 4, h / 2);
  ctx.closePath();
  ctx.fillStyle = mixHex(d.spin > 0.66 ? '#a2533c' : '#7c7578', HAZE, 1 - fade(dz));
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Danger rim so it reads at speed.
  ctx.strokeStyle = alpha(BAD, 0.85);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 6, -h / 2 + 6);
  ctx.lineTo(w / 2 - 6, -h / 2 + 9);
  ctx.stroke();
  ctx.restore();
}

function person(ctx: CanvasRenderingContext2D, core: FreefallCore, v: ViewState, i: number) {
  const c = core.civs[i];
  if (!c || c.saved || c.y < v.depth - 15) return;
  const p = project(c.x, PATH_Y - 20, c.y, v.depth);
  if (!p) return;
  const dz = CAM / p.s;
  if (dz > FAR) return;
  const shirts = ['#4da3ff', '#ff8a3d', '#b46cff', '#22c1a1'];
  const wave = Math.sin(v.t * 9 + c.id) * 0.6;
  ctx.save();
  ctx.globalAlpha = fade(dz) * bornIn(core, c.born);
  ctx.translate(p.x, p.y);
  ctx.scale(p.s * 1.6, p.s * 1.6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -4);
  ctx.lineTo(-18, -20 + wave * 6);
  ctx.moveTo(4, -4);
  ctx.lineTo(18, -20 - wave * 6);
  ctx.moveTo(-3, 12);
  ctx.lineTo(-10 - wave * 3, 24);
  ctx.moveTo(3, 12);
  ctx.lineTo(10 + wave * 3, 24);
  ctx.stroke();
  ctx.fillStyle = shirts[c.look] ?? '#4da3ff';
  ctx.fillRect(-7, -6, 14, 18);
  ctx.strokeRect(-7, -6, 14, 18);
  ctx.fillStyle = '#e8b58f';
  ctx.beginPath();
  ctx.arc(0, -13, 7, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.font = `14px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PAPER;
  ctx.fillRect(-20, -48, 40, 18);
  ctx.lineWidth = 2;
  ctx.strokeRect(-20, -48, 40, 18);
  ctx.fillStyle = INK;
  ctx.fillText('HELP!', 0, -38);
  ctx.restore();
}

function hero(ctx: CanvasRenderingContext2D, core: FreefallCore, f: Fighter, v: ViewState) {
  // Hurt flicker; reduced motion gets a steady half-fade instead of a 14 Hz blink.
  const blink = core.invuln > 0 && (v.reduced || Math.floor(v.t * 14) % 2 === 0);
  const scale = 120 / rigHeight(f);
  const tilt = clamp(core.vx / 560, -1, 1) * 0.5;
  const pose = v.hurt > 0 ? 'hurt' : core.braking ? 'crouch' : 'jump';
  ctx.save();
  ctx.translate(v.x, PATH_Y);
  // Seen from just behind: a dive tucks the hero head-first into the shaft.
  ctx.rotate(tilt + (core.diving ? Math.PI * 0.9 : 0));
  if (blink) ctx.globalAlpha = 0.45;
  ctx.fillStyle = alpha('#000000', 0.25);
  ctx.beginPath();
  ctx.ellipse(0, 10, 46, 16, 0, 0, TAU);
  ctx.fill();
  drawFighter(ctx, f, pose, v.t, {
    x: 0,
    y: 60,
    scale,
    facing: core.vx < -20 ? -1 : 1,
    shadow: false,
    noLift: true,
    fx: false,
    flash: v.hurt > 0 ? v.hurt : 0,
  });
  ctx.restore();
}

/** One slab's three holes, as faint guides on the path line from the hero toward it. */
function guides(ctx: CanvasRenderingContext2D, core: FreefallCore, v: ViewState) {
  const g = core.gate;
  if (!g) return;
  for (const lx of LANES) {
    const a = project(lx, PATH_Y + 60, v.depth + 40, v.depth);
    const b = project(lx, PATH_Y + 60, Math.min(g.y, v.depth + FAR - CAM), v.depth);
    if (!a || !b) continue;
    const mine = Math.abs(v.x - lx) <= g.open / 2;
    ctx.strokeStyle = alpha('#ffffff', mine ? 0.45 : 0.18);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/** The whole POV view, far to near, in the view box's units. */
export function drawWorld(
  ctx: CanvasRenderingContext2D,
  core: FreefallCore,
  f: Fighter,
  v: ViewState,
  reduced: boolean,
) {
  tunnel(ctx, f, v, reduced);
  guides(ctx, core, v);
  // Everything with a depth, sorted far → near; the hero sits at its own depth in the order.
  const items: { d: number; draw: () => void }[] = [];
  core.gates.forEach((g, gi) => {
    items.push({ d: g.y, draw: () => slab(ctx, core, f, v, g.y, gi) });
  });
  core.debris.forEach((d, i) => {
    items.push({ d: d.y, draw: () => rubble(ctx, core, v, i) });
  });
  core.civs.forEach((c, i) => {
    items.push({ d: c.y, draw: () => person(ctx, core, v, i) });
  });
  items.push({ d: v.depth + 0.01, draw: () => hero(ctx, core, f, v) });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.draw();
}
