import type { Fighter } from '~/lib/schema';
import { alpha, brightest, INK, lum, mixHex, readable, shade } from '../engine/color';
import { clamp, hash, lerp, TAU } from '../engine/math';
import {
  AURA,
  aura,
  beam,
  chargeBall,
  dashCone,
  orb,
  ringFlash,
  shield,
  shockRings,
  span,
  warp,
} from './fx';
import { BASE, type P, POSES, type PoseId, phase, poseAt } from './poses';

export { POSES, type PoseId };

type Build = Fighter['rig']['build'];
interface Dims {
  thigh: number;
  shin: number;
  upper: number;
  fore: number;
  torso: number;
  neck: number;
  headR: number;
  sw: number;
  ww: number;
  armW: number;
  legW: number;
  hand: number;
  foot: number;
}

export const DIMS: Record<Build, Dims> = {
  slim: {
    thigh: 27,
    shin: 27,
    upper: 20,
    fore: 19,
    torso: 33,
    neck: 5,
    headR: 10.5,
    sw: 21,
    ww: 14,
    armW: 7.6,
    legW: 9.6,
    hand: 5.3,
    foot: 12,
  },
  normal: {
    thigh: 25.5,
    shin: 25.5,
    upper: 20,
    fore: 19.5,
    torso: 35,
    neck: 5,
    headR: 11,
    sw: 26,
    ww: 17.5,
    armW: 9.8,
    legW: 11.8,
    hand: 6.2,
    foot: 13,
  },
  heavy: {
    thigh: 23.5,
    shin: 24,
    upper: 21,
    fore: 20.5,
    torso: 39,
    neck: 4,
    headR: 11.6,
    sw: 35,
    ww: 25,
    armW: 13.5,
    legW: 15,
    hand: 7.8,
    foot: 15,
  },
};

/** Approximate standing height in rig units (feet to crown) — for layout. */
export const rigHeight = (f: Fighter) => {
  const d = DIMS[f.rig.build];
  return d.thigh + d.shin + d.torso + d.neck + d.headR * 2 - 4;
};

interface V {
  x: number;
  y: number;
}

export interface Skeleton {
  pelvis: V;
  chest: V;
  neck: V;
  head: V;
  shF: V;
  shB: V;
  elF: V;
  elB: V;
  haF: V;
  haB: V;
  kneeF: V;
  kneeB: V;
  ankF: V;
  ankB: V;
  toeF: V;
  toeB: V;
  /** torso angle (lean + rot) */
  body: number;
  /** head angle */
  headA: number;
  headR: number;
  p: P;
}

const down = (a: number): V => ({ x: Math.sin(a), y: Math.cos(a) });
const add = (a: V, b: V, k = 1): V => ({ x: a.x + b.x * k, y: a.y + b.y * k });

export function solve(p: P, d: Dims, headScale = 1, noLift = false): Skeleton {
  const pelvis = { x: p.rx, y: 0 };
  const kneeF = add(pelvis, down(p.tF), d.thigh);
  const ankF = add(kneeF, down(p.tF - p.kF), d.shin);
  const toeF = add(ankF, down(Math.PI / 2 + 0.35 * (p.tF - p.kF)), d.foot * 0.85);
  const kneeB = add(pelvis, down(p.tB), d.thigh);
  const ankB = add(kneeB, down(p.tB - p.kB), d.shin);
  const toeB = add(ankB, down(Math.PI / 2 + 0.35 * (p.tB - p.kB)), d.foot * 0.85);
  const up = { x: Math.sin(p.lean), y: -Math.cos(p.lean) };
  const fwd = { x: Math.cos(p.lean), y: Math.sin(p.lean) };
  const chest = add(pelvis, up, d.torso);
  const sh = add(pelvis, up, d.torso * 0.84);
  const shF = add(sh, fwd, 1.5);
  const shB = add(sh, fwd, -2.5);
  const elF = add(shF, down(p.lean + p.aF), d.upper);
  const haF = add(elF, down(p.lean + p.aF + p.eF), d.fore);
  const elB = add(shB, down(p.lean + p.aB), d.upper);
  const haB = add(elB, down(p.lean + p.aB + p.eB), d.fore);
  const neck = add(pelvis, up, d.torso + d.neck);
  const headA = p.lean + p.head;
  const headR = d.headR * headScale;
  const head = add(neck, { x: Math.sin(headA), y: -Math.cos(headA) }, headR * 0.9);
  const pts = [
    pelvis,
    kneeF,
    ankF,
    toeF,
    kneeB,
    ankB,
    toeB,
    chest,
    shF,
    shB,
    elF,
    haF,
    elB,
    haB,
    neck,
    head,
  ];
  if (p.rot) {
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    for (const q of pts) {
      const x = q.x - pelvis.x;
      const y = q.y - pelvis.y;
      q.x = pelvis.x + x * c - y * s;
      q.y = pelvis.y + x * s + y * c;
    }
  }
  // Ground lock: the lowest body part rests on y = 0, then the pose's lift raises it.
  const r = d.legW * 0.42;
  let low = Math.max(
    ankF.y + r,
    ankB.y + r,
    toeF.y + r * 0.8,
    toeB.y + r * 0.8,
    kneeF.y + r,
    kneeB.y + r,
  );
  low = Math.max(
    low,
    pelvis.y + d.legW * 0.8,
    chest.y + d.sw * 0.32,
    head.y + headR,
    haF.y + d.hand,
    haB.y + d.hand,
  );
  const dy = -low - (noLift ? 0 : p.lift);
  for (const q of pts) q.y += dy;
  return {
    pelvis,
    chest,
    neck,
    head,
    shF,
    shB,
    elF,
    elB,
    haF,
    haB,
    kneeF,
    kneeB,
    ankF,
    ankB,
    toeF,
    toeB,
    body: p.lean + p.rot,
    headA: headA + p.rot,
    headR,
    p,
  };
}

export interface DrawOpts {
  x: number;
  /** Feet / ground line. */
  y: number;
  scale: number;
  facing: 1 | -1;
  alpha?: number;
  /** Flat single-colour silhouette (afterimages). */
  ghost?: string;
  /** Special/aura FX (default true). */
  fx?: boolean;
  /** Motion smears on fast limbs (default true). */
  smear?: boolean;
  /** Ignore the pose's own lift — physics owns the height. */
  noLift?: boolean;
  /** Big-head mode multiplier (head football). */
  headScale?: number;
  /** Held prop. Default: racket for serve/smash. */
  prop?: 'racket' | 'none';
  /** Rim-light colour; null = none. Default: the fighter's brightest theme colour. */
  rim?: string | null;
  /** Ground shadow (default true). */
  shadow?: boolean;
  /** Extra white hit-flash 0..1. */
  flash?: number;
  /** Draw the travelling projectile-special orb (games that simulate their own set false). */
  orb?: boolean;
  /** Glow / smear colour chosen to contrast with the backdrop (clips); defaults to the theme. */
  accent?: string;
  /** Knock-out gap colour drawn around the front arm so fists never merge into the body. */
  gap?: string;
}

interface Look {
  suit: string;
  suitD: string;
  suitL: string;
  trim: string;
  trimD: string;
  trimL: string;
  skin: string;
  skinD: string;
  eye: string;
  hair: string;
  backTint: number;
}

const looks = new Map<string, Look>();
function lookOf(f: Fighter): Look {
  const key = `${f.slug}${f.rig.suit}${f.rig.trim}${f.rig.skin}`;
  const hit = looks.get(key);
  if (hit) return hit;
  const suit = readable(f.rig.suit, 0.03);
  const trim = readable(f.rig.trim, 0.03);
  const l: Look = {
    suit,
    suitD: shade(suit, -0.34),
    suitL: shade(suit, 0.3),
    trim,
    trimD: shade(trim, -0.32),
    trimL: shade(trim, 0.35),
    skin: f.rig.skin,
    skinD: shade(f.rig.skin, -0.25),
    eye: f.rig.eye,
    hair: mixHex(f.rig.suit, INK, 0.55),
    backTint: 0.2,
  };
  looks.set(key, l);
  return l;
}

const OL = 2.4; // ink outline at 1x
const LIGHT: V = { x: 0.6, y: -0.8 };

// ── path builders (add sub-paths, no fill) ─────────────────────────────────────────────
function cap(ctx: CanvasRenderingContext2D, a: V, b: V, ra: number, rb: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.moveTo(a.x + Math.cos(ang + Math.PI / 2) * ra, a.y + Math.sin(ang + Math.PI / 2) * ra);
  ctx.arc(a.x, a.y, ra, ang + Math.PI / 2, ang + (3 * Math.PI) / 2);
  ctx.arc(b.x, b.y, rb, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

function circ(ctx: CanvasRenderingContext2D, c: V, r: number) {
  ctx.moveTo(c.x + r, c.y);
  ctx.arc(c.x, c.y, r, 0, TAU);
}

/** Torso in torso-local space (origin pelvis, y up = negative). */
function torsoPath(ctx: CanvasRenderingContext2D, d: Dims) {
  const T = d.torso;
  const sw = d.sw;
  const ww = d.ww;
  ctx.moveTo(-ww * 0.5, 0);
  ctx.quadraticCurveTo(-ww * 0.66, -T * 0.5, -sw * 0.5, -T * 0.86);
  ctx.quadraticCurveTo(-sw * 0.46, -T * 1.05, -sw * 0.08, -T * 1.03);
  ctx.lineTo(sw * 0.24, -T * 1.0);
  ctx.quadraticCurveTo(sw * 0.64, -T * 0.93, sw * 0.58, -T * 0.6);
  ctx.quadraticCurveTo(sw * 0.5, -T * 0.28, ww * 0.52, -T * 0.06);
  ctx.lineTo(ww * 0.46, 0);
  ctx.quadraticCurveTo(0, ww * 0.28, -ww * 0.5, 0);
  ctx.closePath();
}

/** Head silhouette in head-local space (centre 0,0; facing +x). */
function headPath(ctx: CanvasRenderingContext2D, kind: Fighter['rig']['head'], r: number) {
  if (kind === 'hood') {
    ctx.moveTo(r * 1.0, -r * 0.55);
    ctx.quadraticCurveTo(r * 0.7, -r * 1.45, -r * 0.4, -r * 1.25);
    ctx.quadraticCurveTo(-r * 1.25, -r * 1.0, -r * 1.75, r * 0.15);
    ctx.quadraticCurveTo(-r * 1.2, r * 0.5, -r * 1.05, r * 1.25);
    ctx.lineTo(r * 0.35, r * 1.2);
    ctx.quadraticCurveTo(r * 1.15, r * 0.55, r * 1.0, -r * 0.55);
    ctx.closePath();
    return;
  }
  ctx.moveTo(r * 0.96, 0);
  ctx.ellipse(0, 0, r * 0.96, r * 1.04, 0, 0, TAU);
  ctx.moveTo(r * 0.92, r * 0.42);
  ctx.ellipse(r * 0.3, r * 0.42, r * 0.62, r * 0.54, 0, 0, TAU);
  if (kind === 'horns') {
    ctx.moveTo(r * 0.15, -r * 0.8);
    ctx.quadraticCurveTo(r * 0.7, -r * 1.25, r * 1.25, -r * 2.0);
    ctx.quadraticCurveTo(r * 0.75, -r * 1.05, r * 0.6, -r * 0.55);
    ctx.closePath();
    ctx.moveTo(-r * 0.55, -r * 0.75);
    ctx.quadraticCurveTo(-r * 0.4, -r * 1.5, -r * 0.05, -r * 2.05);
    ctx.quadraticCurveTo(-r * 0.05, -r * 1.3, r * 0.0, -r * 0.85);
    ctx.closePath();
  } else if (kind === 'crown') {
    crownPath(ctx, r);
  } else if (kind === 'helmet' || kind === 'visor') {
    // crest fin
    ctx.moveTo(-r * 0.7, -r * 0.75);
    ctx.quadraticCurveTo(-r * 0.2, -r * 1.45, r * 0.55, -r * 1.05);
    ctx.lineTo(r * 0.3, -r * 0.8);
    ctx.closePath();
  }
}

function crownPath(ctx: CanvasRenderingContext2D, r: number) {
  const base = -r * 0.62;
  ctx.moveTo(-r * 0.8, base);
  const xs = [-0.8, -0.55, -0.3, 0.0, 0.3, 0.55, 0.82];
  for (let i = 0; i < xs.length; i++) {
    const x = (xs[i] ?? 0) * r;
    const yy = i % 2 ? base - r * (i === 3 ? 1.05 : 0.8) : base - r * 0.25;
    ctx.lineTo(x, yy);
  }
  ctx.lineTo(r * 0.82, base + r * 0.15);
  ctx.lineTo(-r * 0.8, base + r * 0.15);
  ctx.closePath();
}

interface CapeGeo {
  inner: V[];
  outer: V[];
}

export function capeGeo(s: Skeleton, d: Dims, t: number): CapeGeo {
  const p = s.p;
  const c = Math.cos(s.body);
  const sn = Math.sin(s.body);
  const loc = (lx: number, ly: number): V => ({
    x: s.pelvis.x + lx * c - ly * sn,
    y: s.pelvis.y + lx * sn + ly * c,
  });
  const a0 = loc(-d.sw * 0.42, -d.torso * 0.96);
  const N = 7;
  const seg = (d.torso * 0.98 + d.thigh * 0.95) / N;
  const base = -(0.12 + 1.05 * p.wind);
  const inner: V[] = [a0];
  const outer: V[] = [loc(-d.sw * 0.55, -d.torso * 0.9)];
  let cur = a0;
  for (let i = 1; i <= N; i++) {
    const k = i / N;
    const wave = Math.sin(t * 6.5 - i * 0.85) * (0.05 + 0.18 * p.wind) * k;
    const ang = base * (0.3 + 0.7 * k) + wave + p.rot * 0.5;
    cur = add(cur, down(ang), seg);
    // the cape folds on the floor rather than sinking through it
    if (cur.y > -2) cur = { x: cur.x - (cur.y + 2) * 0.6, y: -2 };
    inner.push(cur);
    const w = d.sw * 0.2 + k * d.sw * (0.5 + p.wind * 0.45);
    const back = { x: -Math.cos(ang), y: Math.sin(ang) };
    const o2 = add(cur, back, w);
    outer.push(o2.y > -2 ? { x: o2.x - (o2.y + 2) * 0.6, y: -2 } : o2);
  }
  return { inner, outer };
}

function capePath(ctx: CanvasRenderingContext2D, g: CapeGeo, t: number) {
  const first = g.inner[0] as V;
  ctx.moveTo(first.x, first.y);
  for (const q of g.inner) ctx.lineTo(q.x, q.y);
  // scalloped hem
  const a = g.inner[g.inner.length - 1] as V;
  const b = g.outer[g.outer.length - 1] as V;
  for (let i = 1; i <= 4; i++) {
    const k = i / 4;
    const mx = lerp(a.x, b.x, k - 0.125);
    const my = lerp(a.y, b.y, k - 0.125) + 4 + Math.sin(t * 9 + i) * 1.2;
    ctx.quadraticCurveTo(mx, my, lerp(a.x, b.x, k), lerp(a.y, b.y, k));
  }
  for (let i = g.outer.length - 1; i >= 0; i--) {
    const q = g.outer[i] as V;
    ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
}

export function racketGeo(s: Skeleton) {
  const a = s.body + s.p.aF + s.p.eF + 0.25;
  const v = down(a);
  const h = s.haF;
  return {
    a,
    v,
    grip0: add(h, v, -3),
    grip1: add(h, v, 9),
    shaft1: add(h, v, 19),
    head: add(h, v, 29),
  };
}

// ── silhouette + colour passes ─────────────────────────────────────────────────────────
function silhouette(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  s: Skeleton,
  d: Dims,
  t: number,
  prop: boolean,
  fill: string,
  extra: number,
) {
  ctx.beginPath();
  if (f.rig.cape) capePath(ctx, capeGeo(s, d, t), t);
  addLimbs(ctx, s, d);
  ctx.save();
  ctx.translate(s.pelvis.x, s.pelvis.y);
  ctx.rotate(s.body);
  torsoPath(ctx, d);
  ctx.restore();
  cap(ctx, s.chest, s.neck, d.armW * 0.45, d.armW * 0.42);
  ctx.save();
  ctx.translate(s.head.x, s.head.y);
  ctx.rotate(s.headA);
  headPath(ctx, f.rig.head, s.headR);
  ctx.restore();
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineJoin = 'round';
  ctx.lineWidth = extra * 2;
  ctx.fill();
  if (extra > 0) ctx.stroke();
  if (prop) {
    const r = racketGeo(s);
    ctx.lineCap = 'round';
    ctx.lineWidth = 3 + extra * 2;
    ctx.beginPath();
    ctx.moveTo(r.grip0.x, r.grip0.y);
    ctx.lineTo(r.shaft1.x, r.shaft1.y);
    ctx.stroke();
    ctx.lineWidth = 2.6 + extra * 2;
    ctx.beginPath();
    ctx.ellipse(r.head.x, r.head.y, 10, 7.5, Math.atan2(r.v.y, r.v.x), 0, TAU);
    ctx.stroke();
  }
}

function addLimbs(ctx: CanvasRenderingContext2D, s: Skeleton, d: Dims) {
  const aw = d.armW / 2;
  const lw = d.legW / 2;
  cap(ctx, s.shB, s.elB, aw, aw * 0.86);
  cap(ctx, s.elB, s.haB, aw * 0.86, aw * 0.76);
  circ(ctx, s.haB, d.hand);
  cap(ctx, s.pelvis, s.kneeB, lw, lw * 0.84);
  cap(ctx, s.kneeB, s.ankB, lw * 0.84, lw * 0.7);
  cap(ctx, s.ankB, s.toeB, lw * 0.78, lw * 0.62);
  cap(ctx, s.pelvis, s.kneeF, lw, lw * 0.84);
  cap(ctx, s.kneeF, s.ankF, lw * 0.84, lw * 0.7);
  cap(ctx, s.ankF, s.toeF, lw * 0.78, lw * 0.62);
  cap(ctx, s.shF, s.elF, aw, aw * 0.86);
  cap(ctx, s.elF, s.haF, aw * 0.86, aw * 0.76);
  circ(ctx, s.haF, d.hand);
}

/** One cel-shaded capsule. */
function limb(
  ctx: CanvasRenderingContext2D,
  a: V,
  b: V,
  ra: number,
  rb: number,
  base: string,
  dark: string,
  light: string,
) {
  ctx.beginPath();
  cap(ctx, a, b, ra, rb);
  ctx.fillStyle = base;
  ctx.fill();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  let n = { x: -u.y, y: u.x };
  if (n.x * LIGHT.x + n.y * LIGHT.y > 0) n = { x: -n.x, y: -n.y };
  ctx.save();
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(a.x + n.x * ra * 0.22 - u.x * ra, a.y + n.y * ra * 0.22 - u.y * ra);
  ctx.lineTo(b.x + n.x * rb * 0.22 + u.x * rb, b.y + n.y * rb * 0.22 + u.y * rb);
  ctx.lineTo(b.x + n.x * rb * 2 + u.x * rb, b.y + n.y * rb * 2 + u.y * rb);
  ctx.lineTo(a.x + n.x * ra * 2 - u.x * ra, a.y + n.y * ra * 2 - u.y * ra);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = light;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.min(ra, rb) * 0.32;
  ctx.beginPath();
  ctx.moveTo(a.x - n.x * ra * 0.5 + u.x * ra * 0.2, a.y - n.y * ra * 0.5 + u.y * ra * 0.2);
  ctx.lineTo(b.x - n.x * rb * 0.5 - u.x * rb * 0.4, b.y - n.y * rb * 0.5 - u.y * rb * 0.4);
  ctx.stroke();
  ctx.beginPath();
  cap(ctx, a, b, ra, rb);
  ctx.strokeStyle = INK;
  ctx.lineWidth = OL * 0.62;
  ctx.stroke();
}

function fist(ctx: CanvasRenderingContext2D, c: V, r: number, L: Look, back: boolean) {
  ctx.beginPath();
  circ(ctx, c, r);
  ctx.fillStyle = back ? L.trimD : L.trim;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = back ? shade(L.trimD, -0.2) : L.trimD;
  ctx.beginPath();
  ctx.arc(c.x - r * 0.35, c.y + r * 0.35, r, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = alpha('#ffffff', 0.5);
  ctx.beginPath();
  ctx.arc(c.x + r * 0.3, c.y - r * 0.35, r * 0.28, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  circ(ctx, c, r);
  ctx.strokeStyle = INK;
  ctx.lineWidth = OL * 0.62;
  ctx.stroke();
}

function arm(
  ctx: CanvasRenderingContext2D,
  s: Skeleton,
  d: Dims,
  L: Look,
  front: boolean,
  heavy: boolean,
) {
  const sh = front ? s.shF : s.shB;
  const el = front ? s.elF : s.elB;
  const ha = front ? s.haF : s.haB;
  const k = front ? 0 : -L.backTint;
  const suit = shade(L.suit, k);
  const aw = d.armW / 2;
  limb(ctx, sh, el, aw, aw * 0.86, suit, shade(L.suitD, k), shade(L.suitL, k));
  limb(ctx, el, ha, aw * 0.86, aw * 0.76, suit, shade(L.suitD, k), shade(L.suitL, k));
  // glove cuff
  const m = { x: lerp(el.x, ha.x, 0.48), y: lerp(el.y, ha.y, 0.48) };
  limb(ctx, m, ha, aw * 1.02, aw * 0.84, shade(L.trim, k), shade(L.trimD, k), shade(L.trimL, k));
  if (heavy) {
    ctx.beginPath();
    circ(ctx, sh, aw * 1.25);
    ctx.fillStyle = shade(L.trim, k);
    ctx.fill();
    ctx.fillStyle = shade(L.trimD, k);
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, aw * 1.25, 0.2, Math.PI + 0.2);
    ctx.fill();
    ctx.beginPath();
    circ(ctx, sh, aw * 1.25);
    ctx.strokeStyle = INK;
    ctx.lineWidth = OL * 0.62;
    ctx.stroke();
  }
  fist(ctx, ha, d.hand, L, !front);
}

function leg(ctx: CanvasRenderingContext2D, s: Skeleton, d: Dims, L: Look, front: boolean) {
  const knee = front ? s.kneeF : s.kneeB;
  const ank = front ? s.ankF : s.ankB;
  const toe = front ? s.toeF : s.toeB;
  const k = front ? 0 : -L.backTint;
  const lw = d.legW / 2;
  const suit = shade(L.suit, k);
  limb(ctx, s.pelvis, knee, lw, lw * 0.84, suit, shade(L.suitD, k), shade(L.suitL, k));
  limb(ctx, knee, ank, lw * 0.84, lw * 0.7, suit, shade(L.suitD, k), shade(L.suitL, k));
  const m = { x: lerp(knee.x, ank.x, 0.4), y: lerp(knee.y, ank.y, 0.4) };
  limb(ctx, m, ank, lw * 0.98, lw * 0.82, shade(L.trim, k), shade(L.trimD, k), shade(L.trimL, k));
  limb(ctx, ank, toe, lw * 0.8, lw * 0.64, shade(L.trim, k), shade(L.trimD, k), shade(L.trimL, k));
  // sole
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ank.x - 2, ank.y + lw * 0.7);
  ctx.lineTo(toe.x, toe.y + lw * 0.55);
  ctx.stroke();
}

function emblem(
  ctx: CanvasRenderingContext2D,
  kind: Fighter['rig']['emblem'],
  e: number,
  fill: string,
  eye: string,
) {
  if (kind === 'none') return;
  ctx.beginPath();
  switch (kind) {
    case 'bolt':
      ctx.moveTo(-0.25 * e, -e);
      ctx.lineTo(0.5 * e, -e);
      ctx.lineTo(0.08 * e, -0.15 * e);
      ctx.lineTo(0.5 * e, -0.15 * e);
      ctx.lineTo(-0.4 * e, e * 1.05);
      ctx.lineTo(-0.05 * e, 0.12 * e);
      ctx.lineTo(-0.5 * e, 0.12 * e);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const r = i % 2 ? e * 0.45 : e;
        i
          ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
          : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case 'ring':
      ctx.arc(0, 0, e * 0.95, 0, TAU);
      ctx.moveTo(e * 0.48, 0);
      ctx.arc(0, 0, e * 0.48, 0, TAU, true);
      break;
    case 'diamond':
      ctx.moveTo(0, -e * 1.05);
      ctx.lineTo(e * 0.72, 0);
      ctx.lineTo(0, e * 1.05);
      ctx.lineTo(-e * 0.72, 0);
      break;
    case 'chevron':
      ctx.moveTo(-e, -e * 0.55);
      ctx.lineTo(0, e * 0.2);
      ctx.lineTo(e, -e * 0.55);
      ctx.lineTo(e, e * 0.15);
      ctx.lineTo(0, e * 0.9);
      ctx.lineTo(-e, e * 0.15);
      break;
    case 'eye':
      ctx.moveTo(-e, 0);
      ctx.quadraticCurveTo(0, -e * 1.1, e, 0);
      ctx.quadraticCurveTo(0, e * 1.1, -e, 0);
      break;
    case 'fang':
      ctx.moveTo(-e * 0.85, -e * 0.7);
      ctx.lineTo(-e * 0.08, -e * 0.7);
      ctx.lineTo(-e * 0.45, e);
      ctx.closePath();
      ctx.moveTo(e * 0.08, -e * 0.7);
      ctx.lineTo(e * 0.85, -e * 0.7);
      ctx.lineTo(e * 0.45, e);
      break;
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill('evenodd');
  ctx.strokeStyle = INK;
  ctx.lineWidth = OL * 0.6;
  ctx.stroke();
  if (kind === 'eye') {
    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.arc(e * 0.1, 0, e * 0.36, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(e * 0.1, 0, e * 0.15, 0, TAU);
    ctx.fill();
  }
}

function torso(ctx: CanvasRenderingContext2D, f: Fighter, s: Skeleton, d: Dims, L: Look) {
  const T = d.torso;
  ctx.save();
  ctx.translate(s.pelvis.x, s.pelvis.y);
  ctx.rotate(s.body);
  ctx.beginPath();
  torsoPath(ctx, d);
  ctx.fillStyle = L.suit;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // cel shadow on the back third, highlight on the chest
  ctx.fillStyle = L.suitD;
  ctx.beginPath();
  ctx.moveTo(-d.sw, -T * 1.2);
  ctx.lineTo(-d.sw * 0.12, -T * 1.2);
  ctx.quadraticCurveTo(-d.sw * 0.25, -T * 0.5, -d.ww * 0.05, 4);
  ctx.lineTo(-d.sw, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = L.suitL;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(d.sw * 0.3, -T * 0.92);
  ctx.quadraticCurveTo(d.sw * 0.5, -T * 0.8, d.sw * 0.46, -T * 0.6);
  ctx.stroke();
  // collar + belt in trim
  ctx.fillStyle = L.trim;
  ctx.fillRect(-d.sw, -T * 0.16, d.sw * 2, T * 0.12);
  ctx.fillStyle = L.trimD;
  ctx.fillRect(-d.sw, -T * 0.06, d.sw * 2, T * 0.03);
  ctx.beginPath();
  ctx.moveTo(-d.sw * 0.2, -T * 1.1);
  ctx.quadraticCurveTo(d.sw * 0.05, -T * 0.86, d.sw * 0.34, -T * 1.1);
  ctx.lineTo(d.sw * 0.34, -T * 1.2);
  ctx.lineTo(-d.sw * 0.2, -T * 1.2);
  ctx.fillStyle = L.trim;
  ctx.fill();
  // belt buckle
  ctx.fillStyle = f.theme.palette.c3;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.fillRect(d.ww * 0.12, -T * 0.17, d.ww * 0.26, T * 0.14);
  ctx.strokeRect(d.ww * 0.12, -T * 0.17, d.ww * 0.26, T * 0.14);
  ctx.restore();
  ctx.beginPath();
  torsoPath(ctx, d);
  ctx.strokeStyle = INK;
  ctx.lineWidth = OL * 0.62;
  ctx.stroke();
  // chest emblem (3/4 view: squeezed horizontally)
  ctx.save();
  ctx.translate(d.sw * 0.16, -T * 0.6);
  ctx.scale(0.82, 1);
  const em = Math.abs(lum(L.trim) - lum(L.suit)) < 0.08 ? f.theme.palette.c3 : L.trim;
  emblem(ctx, f.rig.emblem, d.sw * 0.28, em, L.eye);
  ctx.restore();
  ctx.restore();
}

function head(ctx: CanvasRenderingContext2D, f: Fighter, s: Skeleton, L: Look, t: number) {
  const r = s.headR;
  const kind = f.rig.head;
  ctx.save();
  ctx.translate(s.head.x, s.head.y);
  ctx.rotate(s.headA);
  const base = kind === 'helmet' || kind === 'visor' || kind === 'hood' ? L.suit : L.skin;
  ctx.beginPath();
  headPath(ctx, kind === 'horns' || kind === 'crown' ? 'bare' : kind, r);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = kind === 'helmet' || kind === 'visor' || kind === 'hood' ? L.suitD : L.skinD;
  ctx.beginPath();
  ctx.arc(-r * 0.55, r * 0.5, r * 1.15, 0, TAU);
  ctx.fill();
  ctx.restore();

  const eyeX = r * 0.5;
  const eyeY = -r * 0.1;
  const blink = (t + hash(f.slug.length) * 3) % 3.2 < 0.11;
  const glowEye = (x: number, y: number, w: number, h: number) => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = alpha(L.eye, 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, w * 2, h * 2.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = L.eye;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, -0.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.2, y - h * 0.15, w * 0.45, h * 0.45, 0, 0, TAU);
    ctx.fill();
  };

  if (kind === 'bare' || kind === 'crown') {
    // hair cap with a spiky fringe
    ctx.beginPath();
    ctx.moveTo(r * 0.72, -r * 0.5);
    ctx.quadraticCurveTo(r * 0.4, -r * 1.25, -r * 0.4, -r * 1.05);
    ctx.quadraticCurveTo(-r * 1.15, -r * 0.7, -r * 1.0, r * 0.2);
    ctx.lineTo(-r * 0.75, r * 0.55);
    ctx.lineTo(-r * 0.45, r * 0.05);
    ctx.lineTo(-r * 0.1, -r * 0.35);
    ctx.lineTo(r * 0.18, -r * 0.3);
    ctx.lineTo(r * 0.3, -r * 0.55);
    ctx.lineTo(r * 0.55, -r * 0.4);
    ctx.closePath();
    ctx.fillStyle = L.hair;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = OL * 0.5;
    ctx.stroke();
    ctx.strokeStyle = alpha('#ffffff', 0.35);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.65);
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.95, r * 0.3, -r * 0.85);
    ctx.stroke();
    // eye, brow, mouth
    if (blink) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(eyeX - r * 0.2, eyeY + r * 0.02);
      ctx.lineTo(eyeX + r * 0.2, eyeY + r * 0.02);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, r * 0.2, r * 0.15, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = L.eye;
      ctx.beginPath();
      ctx.arc(eyeX + r * 0.07, eyeY, r * 0.1, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(eyeX - r * 0.25, eyeY - r * 0.3);
    ctx.lineTo(eyeX + r * 0.3, eyeY - r * 0.18);
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, r * 0.55);
    ctx.lineTo(r * 0.82, r * 0.5);
    ctx.stroke();
  } else if (kind === 'mask' || kind === 'horns') {
    ctx.beginPath();
    ctx.moveTo(r * 1.0, r * 0.12);
    ctx.quadraticCurveTo(r * 1.05, -r * 1.1, -r * 0.1, -r * 1.06);
    ctx.quadraticCurveTo(-r * 1.15, -r * 0.9, -r * 0.95, r * 0.4);
    ctx.lineTo(-r * 0.55, r * 0.95);
    ctx.lineTo(r * 0.1, r * 0.3);
    ctx.closePath();
    ctx.fillStyle = L.suit;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = L.suitD;
    ctx.beginPath();
    ctx.arc(-r * 0.7, r * 0.3, r * 0.9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = L.trim;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.2, -r * 1.2, r * 0.8, -r * 0.6);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = OL * 0.5;
    ctx.stroke();
    // angular lens eye
    ctx.beginPath();
    const lid = blink ? 0.75 : 0;
    ctx.moveTo(r * 0.18, -r * (0.24 - lid * 0.2));
    ctx.lineTo(r * 0.9, -r * (0.34 - lid * 0.3));
    ctx.lineTo(r * 0.8, r * 0.02);
    ctx.lineTo(r * 0.3, r * 0.0);
    ctx.closePath();
    ctx.fillStyle = mixHex(L.eye, '#ffffff', 0.45);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    if (kind === 'horns') {
      ctx.beginPath();
      ctx.moveTo(r * 0.15, -r * 0.8);
      ctx.quadraticCurveTo(r * 0.7, -r * 1.25, r * 1.25, -r * 2.0);
      ctx.quadraticCurveTo(r * 0.75, -r * 1.05, r * 0.6, -r * 0.55);
      ctx.closePath();
      ctx.moveTo(-r * 0.55, -r * 0.75);
      ctx.quadraticCurveTo(-r * 0.4, -r * 1.5, -r * 0.05, -r * 2.05);
      ctx.quadraticCurveTo(-r * 0.05, -r * 1.3, r * 0.0, -r * 0.85);
      ctx.closePath();
      ctx.fillStyle = L.trim;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = OL * 0.55;
      ctx.stroke();
      ctx.strokeStyle = L.trimD;
      ctx.lineWidth = 1.5;
      for (const k of [0.35, 0.55, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(lerp(r * 0.2, r * 1.2, k) - 2, lerp(-r * 0.8, -r * 1.95, k) + 1);
        ctx.lineTo(lerp(r * 0.2, r * 1.2, k) + 2, lerp(-r * 0.8, -r * 1.95, k) + 3);
        ctx.stroke();
      }
    }
  } else if (kind === 'helmet' || kind === 'visor') {
    // crest fin
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.75);
    ctx.quadraticCurveTo(-r * 0.2, -r * 1.45, r * 0.55, -r * 1.05);
    ctx.lineTo(r * 0.3, -r * 0.8);
    ctx.closePath();
    ctx.fillStyle = L.trim;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = OL * 0.5;
    ctx.stroke();
    // jaw guard + vents
    ctx.fillStyle = L.trim;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, r * 0.35);
    ctx.lineTo(r * 0.95, r * 0.3);
    ctx.quadraticCurveTo(r * 0.85, r * 0.9, r * 0.3, r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = L.trimD;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(r * (0.4 + i * 0.16), r * 0.45);
      ctx.lineTo(r * (0.38 + i * 0.16), r * 0.8);
      ctx.stroke();
    }
    if (kind === 'visor') {
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.42);
      ctx.lineTo(r * 1.02, -r * 0.4);
      ctx.quadraticCurveTo(r * 1.1, -r * 0.05, r * 0.98, r * 0.2);
      ctx.lineTo(-r * 0.05, r * 0.1);
      ctx.closePath();
      ctx.fillStyle = L.eye;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = alpha('#ffffff', 0.75);
      ctx.beginPath();
      const g = ((t * 0.6) % 1) * r * 3 - r;
      ctx.moveTo(g, -r * 0.5);
      ctx.lineTo(g + r * 0.22, -r * 0.5);
      ctx.lineTo(g - r * 0.1, r * 0.3);
      ctx.lineTo(g - r * 0.32, r * 0.3);
      ctx.fill();
      ctx.fillStyle = alpha(INK, 0.25);
      ctx.fillRect(-r, r * 0.0, r * 2.2, r * 0.3);
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.28);
      ctx.lineTo(r * 1.0, -r * 0.3);
      ctx.lineTo(r * 0.98, -r * 0.06);
      ctx.lineTo(r * 0.28, -r * 0.04);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      glowEye(r * 0.62, -r * 0.17, r * 0.3, r * 0.08);
    }
  } else if (kind === 'hood') {
    // hood lining + shadowed face
    ctx.fillStyle = alpha(INK, 0.9);
    ctx.beginPath();
    ctx.ellipse(r * 0.42, r * 0.05, r * 0.58, r * 0.72, 0.15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = L.trim;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(r * 0.42, r * 0.05, r * 0.62, r * 0.76, 0.15, -1.9, 1.7);
    ctx.stroke();
    if (!blink) glowEye(eyeX + r * 0.1, eyeY, r * 0.16, r * 0.1);
    ctx.strokeStyle = L.suitD;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.6);
    ctx.quadraticCurveTo(-r * 1.1, r * 0.1, -r * 0.6, r * 1.0);
    ctx.stroke();
  }

  if (kind === 'crown') {
    ctx.beginPath();
    crownPath(ctx, r);
    ctx.fillStyle = L.trim;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = OL * 0.5;
    ctx.stroke();
    ctx.fillStyle = L.eye;
    ctx.beginPath();
    ctx.arc(0, -r * 0.55, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // outline of the head shape
  ctx.beginPath();
  headPath(ctx, kind === 'horns' || kind === 'crown' ? 'bare' : kind, r);
  ctx.strokeStyle = INK;
  ctx.lineWidth = OL * 0.6;
  ctx.stroke();
  ctx.restore();
}

function cape(ctx: CanvasRenderingContext2D, s: Skeleton, d: Dims, L: Look, t: number) {
  const g = capeGeo(s, d, t);
  ctx.beginPath();
  capePath(ctx, g, t);
  ctx.fillStyle = shade(L.trim, -0.12);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // lining visible along the inner edge
  ctx.fillStyle = shade(L.trim, -0.45);
  ctx.beginPath();
  const f0 = g.inner[0] as V;
  ctx.moveTo(f0.x, f0.y);
  for (const q of g.inner) ctx.lineTo(q.x, q.y);
  for (let i = g.inner.length - 1; i >= 0; i--) {
    const a = g.inner[i] as V;
    const b = g.outer[i] as V;
    ctx.lineTo(lerp(a.x, b.x, 0.28), lerp(a.y, b.y, 0.28));
  }
  ctx.fill();
  // folds
  ctx.strokeStyle = alpha(INK, 0.45);
  ctx.lineWidth = 1.6;
  for (const k of [0.5, 0.78]) {
    ctx.beginPath();
    for (let i = 1; i < g.inner.length; i++) {
      const a = g.inner[i] as V;
      const b = g.outer[i] as V;
      const x = lerp(a.x, b.x, k);
      const y = lerp(a.y, b.y, k);
      i === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = alpha('#ffffff', 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < g.inner.length; i++) {
    const a = g.inner[i] as V;
    const b = g.outer[i] as V;
    const x = lerp(a.x, b.x, 0.92);
    const y = lerp(a.y, b.y, 0.92);
    i === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  capePath(ctx, g, t);
  ctx.strokeStyle = INK;
  ctx.lineWidth = OL * 0.62;
  ctx.stroke();
}

function racket(ctx: CanvasRenderingContext2D, s: Skeleton, f: Fighter, L: Look) {
  const r = racketGeo(s);
  const rot = Math.atan2(r.v.y, r.v.x);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e9e4da';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(r.grip1.x, r.grip1.y);
  ctx.lineTo(r.shaft1.x, r.shaft1.y);
  ctx.stroke();
  ctx.strokeStyle = L.trimD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(r.grip0.x, r.grip0.y);
  ctx.lineTo(r.grip1.x, r.grip1.y);
  ctx.stroke();
  ctx.save();
  ctx.translate(r.head.x, r.head.y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 7.5, 0, 0, TAU);
  ctx.fillStyle = alpha('#ffffff', 0.18);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = alpha('#ffffff', 0.75);
  ctx.lineWidth = 0.8;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 2.3, -9);
    ctx.lineTo(i * 2.3, 9);
    ctx.moveTo(-11, i * 1.9);
    ctx.lineTo(11, i * 1.9);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = readable(brightest(f.theme.palette.c1, f.theme.palette.c3), 0.1);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 7.5, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Smears only while the limb is actually striking (phase window). */
const SMEAR_WINDOW: Partial<Record<PoseId, [number, number]>> = {
  punch: [0.18, 0.42],
  kick: [0.32, 0.5],
  uppercut: [0.24, 0.48],
  serve: [0.38, 0.66],
  smash: [0.44, 0.66],
  'kick-ball': [0.34, 0.6],
};

const SMEAR: Partial<Record<PoseId, 'haF' | 'ankF' | 'racket'>> = {
  punch: 'haF',
  kick: 'ankF',
  uppercut: 'haF',
  serve: 'racket',
  smash: 'racket',
  'kick-ball': 'ankF',
};

function smearTrail(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  pose: PoseId,
  t: number,
  d: Dims,
  hs: number,
  noLift: boolean,
  which: 'haF' | 'ankF' | 'racket',
  col: string,
) {
  const pts: V[] = [];
  for (let i = 0; i < 9; i++) {
    const tt = t - i * 0.016;
    const s = solve(poseAt(pose, tt, f.special.kind), d, hs, noLift);
    pts.push(which === 'racket' ? racketGeo(s).head : s[which]);
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as V;
    const b = pts[i] as V;
    len += Math.hypot(a.x - b.x, a.y - b.y);
  }
  if (len < 14) return;
  const w0 = which === 'haF' ? d.hand * 1.5 : which === 'racket' ? 11 : d.legW * 0.75;
  const k = clamp((len - 14) / 40, 0, 1);
  ctx.save();
  ctx.globalAlpha *= 0.55 + 0.45 * k;
  ctx.fillStyle = col;
  ctx.beginPath();
  // tapered ribbon: left side forward, right side back
  const side = (sgn: number) => {
    for (let i = 0; i < pts.length; i++) {
      const idx = sgn > 0 ? i : pts.length - 1 - i;
      const a = pts[Math.max(0, idx - 1)] as V;
      const b = pts[Math.min(pts.length - 1, idx + 1)] as V;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const w = w0 * (1 - idx / pts.length);
      const q = pts[idx] as V;
      const x = q.x + (-dy / l) * w * sgn;
      const y = q.y + (dx / l) * w * sgn;
      i === 0 && sgn > 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
  };
  side(1);
  side(-1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha *= 0.6;
  ctx.stroke();
  ctx.restore();
}

/** World-space joint positions, for hit detection and clip FX. */
export function jointsAt(fighter: Fighter, pose: PoseId, t: number, o: DrawOpts) {
  const d = DIMS[fighter.rig.build];
  const s = solve(poseAt(pose, t, fighter.special.kind), d, o.headScale ?? 1, !!o.noLift);
  const w = (q: V): V => ({ x: o.x + q.x * o.scale * o.facing, y: o.y + q.y * o.scale * s.p.sq });
  return {
    handF: w(s.haF),
    handB: w(s.haB),
    footF: w(s.ankF),
    toeF: w(s.toeF),
    footB: w(s.ankB),
    head: w(s.head),
    chest: w(s.chest),
    pelvis: w(s.pelvis),
    racket: w(racketGeo(s).head),
    headR: s.headR * o.scale,
    p: s.p,
  };
}

/**
 * Draw a fighter. Pure for a given t. (x, y) is the point between the feet on the ground.
 */
export function drawFighter(
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  pose: PoseId,
  t: number,
  o: DrawOpts,
): void {
  const d = DIMS[fighter.rig.build];
  const L = lookOf(fighter);
  const pal = fighter.theme.palette;
  const hs = o.headScale ?? 1;
  const p = poseAt(pose, t, fighter.special.kind);
  const s = solve(p, d, hs, !!o.noLift);
  const u = phase(pose, t);
  const prop = (o.prop ?? (pose === 'serve' || pose === 'smash' ? 'racket' : 'none')) === 'racket';
  const fx = o.fx !== false;
  const kind = fighter.special.kind;
  const top = s.head.y - s.headR;
  const glowBlend: GlobalCompositeOperation =
    o.accent && lum(o.accent) < 0.3 ? 'source-over' : 'lighter';

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.scale * o.facing, o.scale);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;

  if (o.ghost) {
    ctx.translate(0, 0);
    ctx.scale(1 / Math.sqrt(p.sq), p.sq);
    // Opaque, ink-outlined flat afterimage (translucent ghosts read as render bugs).
    silhouette(ctx, fighter, s, d, t, prop, INK, OL);
    silhouette(ctx, fighter, s, d, t, prop, o.ghost, 0);
    ctx.restore();
    return;
  }

  // ground shadow (hard-edged)
  if (o.shadow !== false) {
    const lift = Math.max(0, -(Math.max(s.ankF.y, s.ankB.y, s.head.y + s.headR) + d.legW * 0.4));
    const k = clamp(1 - lift / 140, 0.35, 1);
    ctx.fillStyle = alpha(INK, 0.32 * k);
    ctx.beginPath();
    ctx.ellipse(s.pelvis.x, 1, (d.sw * 0.9 + 10) * k * (p.rot ? 2 : 1), 4.5 * k, 0, 0, TAU);
    ctx.fill();
  }

  // FX behind the body
  if (fx && (pose === 'charge' || (pose === 'special' && p.fx > 0.3 && kind !== 'teleport'))) {
    aura(
      ctx,
      AURA[fighter.theme.motif],
      s.pelvis.x,
      top,
      d.sw * 0.7,
      t,
      o.accent ? { ...pal, c1: o.accent, c3: mixHex(o.accent, '#ffffff', 0.45) } : pal,
      pose === 'charge' ? 0.4 + 0.6 * p.fx : p.fx * 0.6,
      glowBlend,
    );
    if (pose === 'charge') {
      // the glow builds with the roar (p.fx): wider and brighter, crisp on light pages
      const k = clamp(p.fx, 0, 1);
      const glow = o.accent ?? pal.c1;
      ctx.save();
      ctx.globalCompositeOperation = glowBlend;
      const soft = glowBlend === 'lighter';
      silhouette(
        ctx,
        fighter,
        s,
        d,
        t,
        false,
        alpha(glow, (soft ? 0.18 : 0.3) + (soft ? 0.3 : 0.35) * k),
        OL + (soft ? 3 + 7 * k : 2 + 3.5 * k),
      );
      if (soft)
        silhouette(
          ctx,
          fighter,
          s,
          d,
          t,
          false,
          alpha(mixHex(glow, '#ffffff', 0.4), 0.15 + 0.2 * k),
          OL + 2 + 2 * k,
        );
      ctx.restore();
    }
  }
  if (fx && pose === 'special' && kind === 'dash') {
    dashCone(ctx, s.chest, s.pelvis, -top, span(u, 0.26, 0.32) * (1 - span(u, 0.72, 0.85)), t, pal);
  }

  const vis = clamp(p.vis, 0, 1);
  if (vis < 1 && fx) warp(ctx, s.pelvis.x, top, 1 - vis, t, pal);
  if (vis > 0.02) {
    ctx.save();
    if (vis < 1) {
      ctx.translate(s.pelvis.x, s.pelvis.y);
      ctx.scale(vis * vis, 1 + (1 - vis) * 0.7);
      ctx.translate(-s.pelvis.x, -s.pelvis.y);
    }
    // squash & stretch about the feet
    ctx.scale(1 / Math.sqrt(p.sq), p.sq);

    const which = SMEAR[pose];
    const win = SMEAR_WINDOW[pose];
    if (which && o.smear !== false && (!win || (u >= win[0] && u <= win[1])))
      smearTrail(
        ctx,
        fighter,
        pose,
        t,
        d,
        hs,
        !!o.noLift,
        which,
        mixHex(o.accent ?? pal.c3, '#ffffff', 0.5),
      );

    // 1. hard offset shadow  2. rim light  3. ink silhouette
    ctx.save();
    ctx.translate(3.2, 2.4);
    silhouette(ctx, fighter, s, d, t, prop, alpha(INK, 0.28), OL);
    ctx.restore();
    const rim =
      o.rim === undefined ? readable(brightest(pal.c1, pal.c3, fighter.rig.trim), 0.2) : o.rim;
    if (rim) silhouette(ctx, fighter, s, d, t, prop, rim, lum(L.suit) < 0.06 ? OL + 3.4 : OL + 2.4);
    silhouette(ctx, fighter, s, d, t, prop, INK, OL);

    // 4. colour parts, back to front
    if (fighter.rig.cape) cape(ctx, s, d, L, t);
    arm(ctx, s, d, L, false, fighter.rig.build === 'heavy');
    leg(ctx, s, d, L, false);
    torso(ctx, fighter, s, d, L);
    leg(ctx, s, d, L, true);
    // neck
    ctx.beginPath();
    cap(ctx, s.chest, s.neck, d.armW * 0.45, d.armW * 0.42);
    ctx.fillStyle = fighter.rig.head === 'bare' || fighter.rig.head === 'crown' ? L.skin : L.suitD;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = OL * 0.5;
    ctx.stroke();
    head(ctx, fighter, s, L, t);
    if (prop) racket(ctx, s, fighter, L);
    if (o.gap) {
      // knock-out line: a thin paper gap between the front arm and whatever it overlaps
      const aw = d.armW / 2;
      ctx.beginPath();
      cap(ctx, s.shF, s.elF, aw, aw * 0.86);
      cap(ctx, s.elF, s.haF, aw * 0.86, aw * 0.84);
      circ(ctx, s.haF, d.hand);
      ctx.strokeStyle = o.gap;
      ctx.lineJoin = 'round';
      ctx.lineWidth = OL * 2.1;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = OL * 1.2;
      ctx.stroke();
    }
    arm(ctx, s, d, L, true, fighter.rig.build === 'heavy');

    // hit flash
    // Hit flash is opaque (1–2 frames), never a translucent ghost.
    const flash = Math.max(o.flash ?? 0, pose === 'hurt' || pose === 'ko' ? p.fx : 0);
    if (flash >= 0.5) {
      silhouette(ctx, fighter, s, d, t, prop, '#ffffff', 0.5);
    }
    ctx.restore();
  }

  // FX in front
  if (fx) {
    const fxp = o.accent ? { ...pal, c1: o.accent, c3: mixHex(o.accent, '#ffffff', 0.45) } : pal;
    if (pose === 'block') shield(ctx, Math.max(s.haF.x, s.chest.x) + 10, top - 6, p.fx, t, pal);
    if (pose === 'special') {
      const hand = { x: (s.haF.x + s.haB.x) / 2 + 4, y: (s.haF.y + s.haB.y) / 2 };
      if (kind === 'beam') {
        chargeBall(
          ctx,
          hand.x,
          hand.y,
          span(u, 0.05, 0.3) * (1 - span(u, 0.36, 0.4)),
          t,
          fxp,
          glowBlend,
        );
        const k = span(u, 0.37, 0.42) * (1 - span(u, 0.84, 0.94));
        beam(ctx, hand.x, hand.y, 900 * span(u, 0.37, 0.5), t, pal, k);
      } else if (kind === 'projectile') {
        if (u < 0.36) chargeBall(ctx, s.haF.x, s.haF.y, span(u, 0.08, 0.3), t, fxp, glowBlend);
        else if (u < 0.95 && o.orb !== false)
          orb(ctx, s.haF.x + (u - 0.36) * 900, s.haF.y, 10, t, pal, 1);
      } else if (kind === 'shockwave') {
        shockRings(ctx, s.haF.x, span(u, 0.48, 0.98), pal);
      } else if (kind === 'teleport') {
        if (u < 0.4) chargeBall(ctx, s.haF.x, s.haF.y, span(u, 0.05, 0.3), t, fxp, glowBlend);
        ringFlash(ctx, s.chest.x, s.chest.y, span(u, 0.58, 0.74), pal, 70);
      }
    }
  }
  ctx.restore();
}

export { spriteClip } from './clip';

/** Base stance export for tests / previews. */
export const BASE_POSE = BASE;
/** Quick access to dims for games (hurtbox sizing). */
export const dimsOf = (f: Fighter) => DIMS[f.rig.build];
