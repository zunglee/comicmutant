/**
 * Pose library for the sprite rig. A pose is a function of u (0..1 through its loop) that returns
 * joint angles; most are keyframe tracks with per-segment easing, cyclic ones (walk, run) are
 * procedural. Everything here is data + pure maths — no canvas.
 *
 * Angle conventions (rig faces +x):
 *   limb angles are measured from straight DOWN, positive = swung forward.
 *   legs are world-relative; arms and head are relative to the torso lean.
 *   kX = knee bend (shin swings back), eX = elbow bend (forearm swings forward/up).
 */
import type { Fighter } from '~/lib/schema';
import { type Ease, ease, invLerp, TAU } from '../engine/math';

export type PoseId =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'crouch'
  | 'punch'
  | 'kick'
  | 'uppercut'
  | 'block'
  | 'hurt'
  | 'ko'
  | 'victory'
  | 'taunt'
  | 'charge'
  | 'special'
  | 'dash'
  | 'serve'
  | 'smash'
  | 'kick-ball'
  | 'celebrate';

/** `loop` = seconds of the clip (the "GIF") on the character page. */
export const POSES: readonly { id: PoseId; label: string; loop: number }[] = [
  { id: 'idle', label: 'Idle', loop: 1.2 },
  { id: 'walk', label: 'Walk', loop: 0.9 },
  { id: 'run', label: 'Run', loop: 0.56 },
  { id: 'jump', label: 'Jump', loop: 2.4 },
  { id: 'crouch', label: 'Crouch', loop: 1.4 },
  { id: 'punch', label: 'Punch', loop: 2.4 },
  { id: 'kick', label: 'Kick', loop: 2.4 },
  { id: 'uppercut', label: 'Uppercut', loop: 2.4 },
  { id: 'block', label: 'Block', loop: 1.2 },
  { id: 'hurt', label: 'Hurt', loop: 0.8 },
  { id: 'ko', label: 'K.O.', loop: 2.4 },
  { id: 'victory', label: 'Victory', loop: 1.6 },
  { id: 'taunt', label: 'Taunt', loop: 1.6 },
  { id: 'charge', label: 'Power up', loop: 1.2 },
  { id: 'special', label: 'Special', loop: 2.4 },
  { id: 'dash', label: 'Dash', loop: 1.1 },
  { id: 'serve', label: 'Serve', loop: 2.4 },
  { id: 'smash', label: 'Smash', loop: 2.4 },
  { id: 'kick-ball', label: 'Kick ball', loop: 2.4 },
  { id: 'celebrate', label: 'Celebrate', loop: 2.4 },
];

/**
 * Seconds per cycle of each pose's motion track. Games drive poses with t = progress × this, so
 * it is independent of the clip length above; clips re-time attacks with CLIP_WARP instead.
 */
export const POSE_LOOP: Record<PoseId, number> = {
  idle: 1.2,
  walk: 0.9,
  run: 0.56,
  jump: 1.15,
  crouch: 1.4,
  punch: 0.62,
  kick: 0.75,
  uppercut: 0.8,
  block: 1.2,
  hurt: 0.8,
  ko: 2.4,
  victory: 1.6,
  taunt: 1.6,
  charge: 1.2,
  special: 1.7,
  dash: 1.1,
  serve: 1.4,
  smash: 1.1,
  'kick-ball': 1.0,
  celebrate: 1.5,
};

export const CLIP_LOOP = Object.fromEntries(POSES.map((p) => [p.id, p.loop])) as Record<
  PoseId,
  number
>;

type Warp = [clip: number, track: number][];
/**
 * Clip phase → track phase. Attack clips run anticipation → contact (¼) → follow-through (½) →
 * recovery (⅞) → neutral, so stills sampled across the loop show the move in order and the loop
 * never rests on a long-held frame.
 */
export const CLIP_WARP: Partial<Record<PoseId, Warp>> = {
  jump: [
    [0, 0],
    [0.0625, 0.12],
    [0.25, 0.27],
    [0.5, 0.46],
    [0.75, 0.7],
    [0.875, 0.8],
    [1, 1],
  ],
  punch: [
    [0, 0],
    [0.2, 0.2],
    [0.25, 0.29],
    [0.36, 0.45],
    [0.5, 0.6],
    [0.875, 0.86],
    [1, 1],
  ],
  kick: [
    [0, 0],
    [0.2, 0.3],
    [0.25, 0.42],
    [0.36, 0.54],
    [0.5, 0.7],
    [0.875, 0.9],
    [1, 1],
  ],
  uppercut: [
    [0, 0],
    [0.2, 0.24],
    [0.25, 0.4],
    [0.36, 0.55],
    [0.5, 0.7],
    [0.875, 0.9],
    [1, 1],
  ],
  serve: [
    [0, 0],
    [0.2, 0.34],
    [0.25, 0.48],
    [0.5, 0.66],
    [0.7, 0.8],
    [0.875, 0.95],
    [1, 1],
  ],
  smash: [
    [0, 0],
    [0.14, 0.24],
    [0.21, 0.44],
    [0.25, 0.53],
    [0.5, 0.7],
    [0.875, 0.92],
    [1, 1],
  ],
  'kick-ball': [
    [0, 0],
    [0.2, 0.3],
    [0.25, 0.42],
    [0.5, 0.62],
    [0.875, 0.92],
    [1, 1],
  ],
  celebrate: [
    [0, 0],
    [0.0625, 0.18],
    [0.25, 0.26],
    [0.5, 0.52],
    [0.625, 0.6],
    [0.875, 0.88],
    [1, 1],
  ],
};
export const SPECIAL_WARP: Record<Fighter['special']['kind'], Warp> = {
  beam: [
    [0, 0],
    [0.2, 0.3],
    [0.25, 0.42],
    [0.5, 0.62],
    [0.75, 0.86],
    [0.875, 0.93],
    [1, 1],
  ],
  projectile: [
    [0, 0],
    [0.2, 0.3],
    [0.25, 0.37],
    [0.5, 0.56],
    [0.875, 0.9],
    [1, 1],
  ],
  shockwave: [
    [0, 0],
    [0.15, 0.2],
    [0.2, 0.4],
    [0.25, 0.5],
    [0.5, 0.68],
    [0.875, 0.9],
    [1, 1],
  ],
  dash: [
    [0, 0],
    [0.15, 0.22],
    [0.25, 0.5],
    [0.5, 0.72],
    [0.875, 0.9],
    [1, 1],
  ],
  teleport: [
    [0, 0],
    [0.12, 0.3],
    [0.18, 0.5],
    [0.25, 0.7],
    [0.5, 0.82],
    [0.875, 0.95],
    [1, 1],
  ],
};

/** Piecewise-linear lookup in a warp table. */
export function warp(w: Warp | undefined, c: number): number {
  if (!w) return c;
  for (let i = 1; i < w.length; i++) {
    const b = w[i] as [number, number];
    if (c <= b[0]) {
      const a = w[i - 1] as [number, number];
      return a[1] + ((c - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]);
    }
  }
  return c;
}

/** Joint state for one instant. */
export interface P {
  rx: number;
  lift: number;
  lean: number;
  head: number;
  aF: number;
  eF: number;
  aB: number;
  eB: number;
  tF: number;
  kF: number;
  tB: number;
  kB: number;
  /** Whole-body rotation about the pelvis (+ = topple forward). */
  rot: number;
  /** Squash/stretch: 1 neutral, <1 squashed. */
  sq: number;
  /** Effect intensity 0..1 (aura, beam, flash — meaning depends on the pose). */
  fx: number;
  /** Cape wind 0 hanging … 1 streaming. */
  wind: number;
  /** Visibility 0..1 (teleport). */
  vis: number;
}

const FIELDS = [
  'rx',
  'lift',
  'lean',
  'head',
  'aF',
  'eF',
  'aB',
  'eB',
  'tF',
  'kF',
  'tB',
  'kB',
  'rot',
  'sq',
  'fx',
  'wind',
  'vis',
] as const satisfies readonly (keyof P)[];

/** Fighting stance every keyframe starts from: open guard, lead fist well off the face. */
export const BASE: P = {
  rx: 0,
  lift: 0,
  lean: 0.14,
  head: -0.06,
  aF: 0.95,
  eF: 1.45,
  aB: 0.35,
  eB: 2.3,
  tF: 0.4,
  kF: 0.45,
  tB: -0.32,
  kB: 0.08,
  rot: 0,
  sq: 1,
  fx: 0,
  wind: 0.2,
  vis: 1,
};

type Frame = [u: number, p: Partial<P>, e?: Ease];
type Track = (u: number) => P;

/** Keyframe track. Each frame is a delta on BASE; the ease belongs to the segment arriving at it. */
function track(frames: Frame[]): Track {
  const full = frames.map(([u, p, e]) => ({
    u,
    p: { ...BASE, ...p } as P,
    e: e ?? ease.inOutQuad,
  }));
  return (u: number) => {
    const first = full[0] as (typeof full)[number];
    if (u <= first.u) return { ...first.p };
    for (let i = 1; i < full.length; i++) {
      const b = full[i] as (typeof full)[number];
      if (u <= b.u) {
        const a = full[i - 1] as (typeof full)[number];
        const k = b.e(invLerp(a.u, b.u, u));
        const out = {} as P;
        for (const f of FIELDS) out[f] = a.p[f] + (b.p[f] - a.p[f]) * k;
        return out;
      }
    }
    return { ...(full[full.length - 1] as (typeof full)[number]).p };
  };
}

const proc =
  (fn: (u: number) => Partial<P>): Track =>
  (u) => ({ ...BASE, ...fn(u) });

const S = (u: number, n = 1) => Math.sin(u * TAU * n);
const C = (u: number, n = 1) => Math.cos(u * TAU * n);
const pos = (v: number) => (v > 0 ? v : 0);

// ── locomotion ────────────────────────────────────────────────────────────────────────
// Breathing: shoulders (arms + lean) rise and fall, weight shifts, cape sways.
const idle = proc((u) => ({
  tF: 0.5 + 0.05 * S(u),
  kF: 0.52 + 0.1 * S(u),
  tB: -0.44 - 0.03 * S(u),
  kB: 0.28 + 0.06 * S(u),
  lean: 0.14 + 0.04 * S(u),
  head: -0.06 + 0.05 * S(u + 0.15),
  aF: 0.95 - 0.1 * S(u, 2),
  eF: 1.45 + 0.12 * S(u, 2),
  aB: 0.35 - 0.09 * S(u, 2),
  eB: 2.3 + 0.08 * S(u + 0.2),
  rx: 2.6 * S(u),
  sq: 1 + 0.025 * S(u + 0.25),
  wind: 0.3 + 0.25 * (0.5 + 0.5 * S(u + 0.3)),
}));
const walk = proc((u) => ({
  tF: 0.08 + 0.58 * S(u),
  kF: 0.12 + 0.85 * pos(C(u)) ** 1.4,
  tB: 0.08 - 0.58 * S(u),
  kB: 0.12 + 0.85 * pos(-C(u)) ** 1.4,
  lean: 0.16 + 0.04 * S(u, 2),
  // arms swing against the legs; elbows looser so the fists travel well clear of the chin
  aF: 0.35 - 0.95 * S(u),
  eF: 0.95 + 0.3 * S(u),
  aB: 0.25 + 0.95 * S(u),
  eB: 1.05 - 0.3 * S(u),
  head: -0.04 + 0.05 * S(u, 2),
  // highest on the passing pose (legs crossing), lowest on the plant
  lift: 4.5 * pos(C(u, 2)),
  sq: 1 - 0.03 * pos(-C(u, 2)),
  wind: 0.55 + 0.2 * S(u - 0.2, 2),
}));
// Swing knee folds high while the stance leg drives straight, so the passing pose reads open.
const run = proc((u) => ({
  tF: 0.35 + 0.95 * S(u),
  kF: 0.08 + 1.45 * pos(C(u)) ** 1.2,
  tB: 0.35 - 0.95 * S(u),
  kB: 0.08 + 1.45 * pos(-C(u)) ** 1.2,
  lean: 0.6,
  head: -0.42,
  aF: -1.35 * S(u),
  eF: 1.55,
  aB: 1.35 * S(u),
  eB: 1.55,
  // flight at full stride
  lift: 10 * Math.abs(S(u)) ** 1.5,
  sq: 1 + 0.04 * Math.abs(S(u)) - 0.04 * Math.abs(C(u)),
  wind: 1,
}));
// Low prowl: back knee on the floor, front knee forward, weight over the toes, guard up.
const crouch = proc((u) => ({
  lean: 0.45 + 0.06 * S(u),
  head: -0.45 + 0.08 * S(u),
  tF: 1.45 + 0.08 * S(u),
  kF: 1.45 + 0.12 * S(u),
  tB: -0.32,
  kB: 2.3 + 0.06 * S(u),
  aF: 1.15 + 0.15 * S(u),
  eF: 0.7 + 0.12 * S(u),
  aB: 0.9,
  eB: 1.2,
  rx: 3 * S(u),
  sq: 1 - 0.05 * pos(S(u)) + 0.02 * pos(-S(u)),
  // cape streams back off the folded legs
  wind: 0.85 + 0.12 * S(u + 0.2),
}));
// Squat → fully stretched take-off → split-leg reach at the apex → land.
const jump = track([
  [0, {}],
  [
    0.14,
    {
      tF: 1.05,
      kF: 1.75,
      tB: 0.45,
      kB: 1.75,
      lean: 0.42,
      aF: -0.5,
      eF: 0.6,
      aB: -0.7,
      eB: 0.5,
      sq: 0.84,
    },
    ease.outQuad,
  ],
  [
    0.26,
    {
      tF: 0.08,
      kF: 0.04,
      tB: -0.12,
      kB: 0.08,
      lean: -0.02,
      aF: 2.95,
      eF: 0.08,
      aB: 2.75,
      eB: 0.12,
      lift: 18,
      sq: 1.14,
      wind: 0.2,
      head: -0.2,
    },
    ease.outQuad,
  ],
  [
    0.46,
    {
      tF: 1.15,
      kF: 0.25,
      tB: -0.8,
      kB: 0.45,
      lean: 0.06,
      aF: 2.7,
      eF: 0.12,
      aB: -0.45,
      eB: 0.8,
      lift: 40,
      wind: 0.35,
      head: -0.25,
    },
    ease.outCubic,
  ],
  [
    0.7,
    {
      tF: 0.5,
      kF: 0.6,
      tB: -0.15,
      kB: 0.6,
      lean: 0.1,
      aF: 1.3,
      eF: 1.0,
      aB: 0.8,
      eB: 1.2,
      lift: 14,
      wind: 0.9,
    },
    ease.inQuad,
  ],
  [
    0.82,
    {
      tF: 1.0,
      kF: 1.6,
      tB: 0.4,
      kB: 1.6,
      lean: 0.4,
      aF: 0.6,
      eF: 1.4,
      aB: 0.2,
      eB: 1.6,
      sq: 0.84,
      wind: 0.5,
    },
    ease.inQuad,
  ],
  [1, {}, ease.outBack],
]);

// ── strikes ───────────────────────────────────────────────────────────────────────────
// Wind-up, snap with rear shoulder pulled back and rear heel up, hold, overshoot recoil.
const punchHit: Partial<P> = {
  lean: 0.38,
  aF: 1.25,
  eF: 0.03,
  aB: -0.35,
  eB: 2.3,
  rx: 8,
  tF: 0.62,
  kF: 0.65,
  tB: -0.8,
  kB: 0.02,
  head: 0.12,
  wind: 0.5,
};
const punch = track([
  [0, {}],
  [
    0.16,
    { lean: 0.04, aF: 0.4, eF: 2.2, aB: 0.75, eB: 1.8, rx: -3, tF: 0.42, tB: -0.36, head: 0 },
    ease.outQuad,
  ],
  [0.27, punchHit, ease.outExpo],
  [0.48, { ...punchHit, lean: 0.36, rx: 7.5 }],
  [
    0.6,
    {
      lean: 0.02,
      aF: 0.6,
      eF: 1.9,
      aB: 0.5,
      eB: 2.1,
      rx: -2.5,
      tF: 0.45,
      kF: 0.5,
      tB: -0.36,
      kB: 0.1,
    },
    ease.outQuad,
  ],
  [0.8, { rx: 1 }, ease.inOutQuad],
  [1, {}, ease.inOutQuad],
]);

const kickChamber: Partial<P> = {
  tF: 1.55,
  kF: 2.35,
  tB: -0.02,
  kB: 0.1,
  lean: -0.15,
  aF: 0.6,
  eF: 1.9,
  aB: 0.2,
  eB: 2.0,
  wind: 0.3,
};
const kickHit: Partial<P> = {
  tF: 1.62,
  kF: 0.04,
  tB: 0.16,
  kB: 0.04,
  lean: -0.5,
  aF: -0.45,
  eF: 1.1,
  aB: 0.85,
  eB: 1.5,
  head: 0.25,
  wind: 0.6,
};
const kick = track([
  [0, {}],
  [0.18, kickChamber, ease.outQuad],
  [0.3, { ...kickChamber, tF: 1.6, kF: 2.4, lean: -0.2 }],
  [0.4, kickHit, ease.outExpo],
  [0.56, { ...kickHit, tF: 1.58, lean: -0.47 }],
  [0.72, { ...kickChamber, tF: 1.3, kF: 1.9, lean: -0.1 }],
  [
    0.86,
    {
      tF: 0.7,
      kF: 0.5,
      tB: -0.45,
      kB: 0.25,
      lean: 0.25,
      aF: 0.9,
      eF: 1.5,
      aB: 0.4,
      eB: 2.2,
      rx: 4,
    },
    ease.inQuad,
  ],
  [1, {}],
]);
const uppercut = track([
  [0, {}],
  [
    0.22,
    {
      lean: 0.55,
      head: -0.1,
      tF: 1.05,
      kF: 1.75,
      tB: 0.2,
      kB: 1.3,
      aF: -0.45,
      eF: 1.1,
      aB: 0.6,
      eB: 2.2,
      sq: 0.86,
    },
    ease.outQuad,
  ],
  [
    0.38,
    {
      lean: -0.18,
      head: -0.35,
      tF: 0.25,
      kF: 0.15,
      tB: -0.32,
      kB: 0.4,
      aF: 2.75,
      eF: 0.45,
      aB: 0.2,
      eB: 2.1,
      lift: 15,
      sq: 1.12,
      wind: 0.8,
    },
    ease.outExpo,
  ],
  [
    0.55,
    {
      lean: -0.2,
      head: -0.35,
      tF: 0.3,
      kF: 0.25,
      tB: -0.3,
      kB: 0.5,
      aF: 2.8,
      eF: 0.4,
      aB: 0.2,
      eB: 2.1,
      lift: 17,
      sq: 1.04,
      wind: 0.6,
    },
  ],
  [0.75, { lift: 0, tF: 0.6, kF: 0.9, tB: -0.1, kB: 0.6, lean: 0.2, sq: 0.92 }, ease.inQuad],
  [1, {}],
]);

// Forearms crossed as an X in front of the face; two incoming hits per loop.
const blockPose: Partial<P> = {
  lean: -0.08,
  head: 0.32,
  aF: 1.62,
  eF: 2.05,
  aB: 0.55,
  eB: 2.0,
  tF: 0.55,
  kF: 0.78,
  tB: -0.36,
  kB: 0.32,
  fx: 1,
};
const blockHit: Partial<P> = { ...blockPose, rx: -7, lean: -0.18, head: 0.4, kF: 0.92, sq: 0.97 };
const block = track([
  [0, blockPose],
  [0.06, blockHit, ease.outExpo],
  [0.3, { ...blockPose, rx: -3 }, ease.inOutSine],
  [0.5, blockPose, ease.inOutSine],
  [0.56, blockHit, ease.outExpo],
  [0.8, { ...blockPose, rx: -3 }, ease.inOutSine],
  [1, blockPose, ease.inOutSine],
]);

// Flash, head snaps back with arms splayed and hips back, reel, recover.
const recoil: Partial<P> = {
  lean: -0.42,
  head: -0.95,
  aF: -1.35,
  eF: 0.2,
  aB: 1.6,
  eB: 0.3,
  rx: -16,
  tF: 0.75,
  kF: 0.4,
  tB: -0.4,
  kB: 0.5,
  wind: 0.9,
};
const reel: Partial<P> = {
  lean: -0.18,
  head: -0.45,
  aF: -0.6,
  eF: 0.6,
  aB: 1.2,
  eB: 0.6,
  rx: -12,
  tF: 0.6,
  kF: 0.6,
  tB: -0.3,
  kB: 0.5,
  wind: 0.5,
};
const hurt = track([
  [0, { fx: 1, aF: 0.2, eF: 0.6 }],
  [0.07, { fx: 1, rx: -2, lean: -0.2, head: -0.3, aF: -0.4, eF: 0.3, aB: 0.9, eB: 0.6 }],
  [0.16, { ...recoil, fx: 0 }, ease.outExpo],
  [0.45, { ...recoil, lean: -0.38, rx: -15, head: -0.85 }],
  [0.65, reel, ease.inOutQuad],
  [0.8, { ...reel, rx: -8, head: -0.25 }, ease.inOutSine],
  [1, {}, ease.inOutQuad],
]);
const lying: Partial<P> = {
  rot: -1.55,
  lean: 0,
  head: -0.32,
  aF: 0.35,
  eF: 0.2,
  aB: -0.3,
  eB: 0.25,
  rx: -25,
  tF: 0.4,
  kF: 0.5,
  tB: 0.2,
  kB: 0.8,
  lift: 0,
  wind: 0,
};
const ko = track([
  [0, { fx: 1 }],
  [0.05, { fx: 1, lean: -0.2, head: -0.2 }],
  [
    0.1,
    {
      lean: -0.65,
      head: -0.6,
      aF: -0.6,
      eF: 0.5,
      aB: -0.9,
      eB: 0.5,
      rx: -12,
      tF: 0.7,
      kF: 0.3,
      tB: -0.1,
      kB: 0.6,
    },
    ease.outExpo,
  ],
  [
    0.24,
    {
      lean: -0.35,
      head: 0.5,
      aF: 0.2,
      eF: 0.4,
      aB: 0.1,
      eB: 0.6,
      rx: -16,
      tF: 0.9,
      kF: 1.6,
      tB: 0.6,
      kB: 1.8,
      sq: 0.95,
    },
  ],
  [0.4, { ...lying, rot: -1.5, rx: -22, aF: 0.9, eF: 0.6, aB: 0.4, kF: 0.6, kB: 0.9 }, ease.inQuad],
  [
    0.47,
    {
      ...lying,
      rot: -1.52,
      head: -0.4,
      aF: 0.6,
      eF: 0.4,
      lift: 7,
      tF: 0.7,
      kF: 0.2,
      tB: 0.6,
      kB: 0.4,
    },
    ease.outQuad,
  ],
  [0.55, lying, ease.inQuad],
  [0.61, { ...lying, tF: 0.15, kF: 1.0, tB: 0.5, kB: 0.3 }, ease.outQuad],
  [0.69, { ...lying, tF: 0.45, kF: 0.45, tB: 0.15, kB: 0.9 }, ease.inOutQuad],
  [0.76, lying, ease.inOutQuad],
  [1, lying],
]);
// ── attitude ──────────────────────────────────────────────────────────────────────────
// Planted hero: wide base, fist raised up-and-forward (clear of the head), pump beat, settle.
const victoryPose: Partial<P> = {
  lean: -0.14,
  head: -0.3,
  aF: -0.6,
  eF: 2.0,
  aB: 3.75,
  eB: 0.08,
  tF: 0.38,
  kF: 0.04,
  tB: -0.38,
  kB: 0.04,
  wind: 0.85,
};
// Planted hero: near fist on the hip, far fist raised up-and-back (clear of the head), two pump beats with a chest heave.
const victory = track([
  [0, victoryPose],
  [0.14, { ...victoryPose, aB: 3.45, eB: 1.3, lean: -0.04, sq: 0.95, wind: 0.7 }, ease.outQuad],
  [
    0.28,
    { ...victoryPose, aB: 3.85, eB: 0.02, lean: -0.2, head: -0.38, sq: 1.05, lift: 3, wind: 1 },
    ease.outBack,
  ],
  [0.5, { ...victoryPose, wind: 0.9 }, ease.inOutSine],
  [0.64, { ...victoryPose, aB: 3.45, eB: 1.3, lean: -0.04, sq: 0.95, wind: 0.7 }, ease.outQuad],
  [
    0.78,
    { ...victoryPose, aB: 3.85, eB: 0.02, lean: -0.2, head: -0.38, sq: 1.05, lift: 3, wind: 1 },
    ease.outBack,
  ],
  [1, victoryPose, ease.inOutSine],
]);
// Chest out, chin up, head tilting, both hands pumping "come on".
// Chest puffed, chin up, near hand curling "come here" toward the body, other hand on the hip.
const taunt = proc((u) => {
  const beat = (0.5 + 0.5 * S(u, 2)) ** 1.3;
  return {
    lean: -0.24 - 0.06 * beat,
    head: -0.3 + 0.22 * S(u),
    aF: 0.95 - 0.2 * beat,
    eF: 0.35 + 2.0 * beat,
    aB: -0.6,
    eB: 2.0,
    tF: 0.32,
    kF: 0.08 + 0.08 * S(u),
    tB: -0.32,
    kB: 0.06,
    rx: 2.5 * S(u),
    sq: 1 + 0.035 * beat,
    wind: 0.35 + 0.2 * S(u, 2),
  };
});
// Squat, tense, tremble, fists clench on the beat — then roar up as the aura peaks.
// Power-up flex: wide stance, fists driven down and apart; the squat deepens and the roar builds once per loop.
const charge = proc((u) => {
  const ramp = 0.5 - 0.5 * Math.cos(u * TAU);
  const clench = pos(S(u, 4)) ** 4;
  return {
    lean: 0.18 - 0.32 * ramp,
    head: 0.25 - 0.75 * ramp,
    aF: 0.5 + 0.15 * clench + 0.1 * ramp,
    eF: 0.25 + 0.15 * clench,
    aB: -0.7 - 0.15 * clench - 0.1 * ramp,
    eB: 0.25 + 0.15 * clench,
    tF: 0.75 + 0.25 * (1 - ramp),
    kF: 0.9 + 0.5 * (1 - ramp),
    tB: -0.75 - 0.1 * (1 - ramp),
    kB: 0.45 + 0.3 * (1 - ramp),
    rx: Math.sin(u * TAU * 22) * (0.5 + 1.2 * ramp),
    sq: 0.93 + 0.1 * ramp - 0.02 * clench,
    fx: 0.35 + 0.65 * ramp,
    wind: 0.5 + 0.5 * ramp,
  };
});
// Lunge, then skid to a stop (lean back, lead leg braced) and spring off again.
const lunge: Partial<P> = {
  lean: 0.78,
  head: -0.5,
  aF: -1.25,
  eF: 0.5,
  aB: -1.45,
  eB: 0.4,
  tF: 1.25,
  kF: 0.45,
  tB: -0.85,
  kB: 0.2,
  lift: 2,
  wind: 1,
};
const skid: Partial<P> = {
  lean: -0.25,
  head: 0,
  tF: 1.0,
  kF: 0.05,
  tB: 0.2,
  kB: 1.45,
  aF: 1.2,
  eF: 0.6,
  aB: 0.9,
  eB: 0.8,
  wind: 0.55,
  sq: 0.95,
};
const dash = track([
  [0, lunge],
  [0.25, { ...lunge, lift: 4, lean: 0.86 }, ease.inOutSine],
  [0.5, lunge, ease.inOutSine],
  [0.62, skid, ease.outQuad],
  [0.82, { ...skid, lean: -0.18, kB: 1.35 }],
  [1, lunge, ease.inQuad],
]);

// ── sport ─────────────────────────────────────────────────────────────────────────────
// Low serve: racket back at the hip, contact below the waist, follow-through up across the body.
const serveReady: Partial<P> = {
  lean: 0.12,
  aB: 1.3,
  eB: 0.35,
  aF: -1.0,
  eF: 0.3,
  tF: 0.36,
  kF: 0.2,
  tB: -0.3,
  kB: 0.1,
  head: 0.2,
};
// True underhand serve: racket back at the hip, swings low through the dropping shuttle below the waist,
// follows through up and forward (never across the face).
const serve = track([
  [0, serveReady],
  [0.32, { ...serveReady, aF: -1.35, eF: 0.25, aB: 1.2, eB: 0.4, head: 0.3 }],
  [
    0.48,
    {
      lean: 0.22,
      aB: 0.6,
      eB: 1.0,
      aF: 0.35,
      eF: 0.15,
      tF: 0.5,
      kF: 0.45,
      tB: -0.45,
      kB: 0.05,
      head: 0.3,
    },
    ease.outExpo,
  ],
  [
    0.66,
    {
      lean: 0.08,
      aB: 0.2,
      eB: 1.4,
      aF: 2.1,
      eF: 0.35,
      tF: 0.5,
      kF: 0.4,
      tB: -0.42,
      kB: 0.1,
      head: 0.0,
    },
    ease.outQuad,
  ],
  [1, serveReady],
]);
// Jump smash: cocked behind the head, whip at the top, follow-through low across the body.
// Racket dropped behind the back (elbow up and back, clear of the face), whip over the top, follow-through low.
const smash = track([
  [0, {}],
  [
    0.24,
    {
      lean: 0.3,
      tF: 1.0,
      kF: 1.6,
      tB: 0.4,
      kB: 1.6,
      aF: 3.6,
      eF: 1.3,
      aB: 1.6,
      eB: 0.6,
      sq: 0.9,
      head: -0.3,
    },
    ease.outQuad,
  ],
  [
    0.42,
    {
      lean: -0.28,
      tF: 0.9,
      kF: 1.6,
      tB: -0.25,
      kB: 1.4,
      aF: 4.05,
      eF: 1.7,
      aB: 2.4,
      eB: 0.4,
      lift: 22,
      head: -0.45,
      wind: 0.6,
    },
    ease.outCubic,
  ],
  [
    0.53,
    {
      lean: 0.4,
      tF: -0.15,
      kF: 0.6,
      tB: 0.95,
      kB: 1.4,
      aF: 1.6,
      eF: 0.08,
      aB: 0.2,
      eB: 1.6,
      lift: 24,
      head: 0.1,
      wind: 0.9,
    },
    ease.outExpo,
  ],
  [
    0.68,
    {
      lean: 0.45,
      tF: 0.6,
      kF: 1.0,
      tB: 0.3,
      kB: 1.2,
      aF: 0.25,
      eF: 0.35,
      aB: -0.3,
      eB: 1.4,
      lift: 8,
      head: 0.2,
    },
    ease.outQuad,
  ],
  [
    0.8,
    {
      lean: 0.35,
      tF: 1.0,
      kF: 1.6,
      tB: 0.4,
      kB: 1.6,
      aF: 0.2,
      eF: 0.5,
      aB: 0.2,
      eB: 1.6,
      lift: 0,
      sq: 0.9,
    },
    ease.inQuad,
  ],
  [1, {}],
]);
// Low strike: the boot meets the ball near the floor, then follows through high.
const approach: Partial<P> = {
  lean: 0.15,
  tF: 0.2,
  kF: 0.2,
  tB: -0.2,
  kB: 0.2,
  aF: 0.3,
  eF: 0.6,
  aB: -0.3,
  eB: 0.6,
  head: 0.25,
};
const kickBall = track([
  [0, approach],
  [
    0.3,
    {
      lean: 0.08,
      tF: -0.95,
      kF: 1.75,
      tB: 0.22,
      kB: 0.15,
      aF: -0.7,
      eF: 0.6,
      aB: 1.0,
      eB: 0.6,
      head: 0.4,
      wind: 0.3,
    },
    ease.inOutQuad,
  ],
  [
    0.42,
    {
      lean: -0.06,
      tF: 0.42,
      kF: 0.06,
      tB: 0.22,
      kB: 0.14,
      aF: 0.6,
      eF: 0.6,
      aB: -0.4,
      eB: 0.6,
      head: 0.35,
    },
    ease.outExpo,
  ],
  [
    0.6,
    {
      lean: -0.32,
      tF: 1.7,
      kF: 0.08,
      tB: 0.1,
      kB: 0.1,
      aF: 1.0,
      eF: 0.6,
      aB: -0.7,
      eB: 0.6,
      head: -0.05,
      wind: 0.6,
    },
    ease.outQuad,
  ],
  [1, approach],
]);
// Star jumps: limbs spread wide (never a tuck), a spinning X on the big hop, fist pumps.
const cheer: Partial<P> = {
  aF: 2.25,
  eF: 0.15,
  aB: 3.85,
  eB: 0.1,
  tF: 0.25,
  kF: 0.12,
  tB: -0.25,
  kB: 0.12,
  head: -0.3,
  lean: -0.04,
  wind: 0.5,
};
const dip: Partial<P> = {
  ...cheer,
  tF: 0.85,
  kF: 1.35,
  tB: 0.45,
  kB: 1.3,
  lean: 0.25,
  sq: 0.88,
  aF: 1.95,
  eF: 0.55,
  aB: 3.75,
  eB: 0.4,
};
// Two star jumps: limbs flung into a wide X at the apex (head clear), fist pump between hops.
const celebrate = track([
  [0, cheer],
  [0.1, dip, ease.outQuad],
  [
    0.24,
    {
      ...cheer,
      tF: 0.75,
      kF: 0.05,
      tB: -0.75,
      kB: 0.08,
      aF: 2.05,
      eF: 0.04,
      aB: 4.0,
      eB: 0.04,
      lift: 22,
      sq: 1.06,
      wind: 0.8,
    },
    ease.outCubic,
  ],
  [0.36, dip, ease.inQuad],
  [
    0.52,
    {
      ...cheer,
      tF: 0.85,
      kF: 0.05,
      tB: -0.85,
      kB: 0.06,
      aF: 2.0,
      eF: 0.03,
      aB: 4.05,
      eB: 0.03,
      lift: 38,
      sq: 1.08,
      wind: 1,
    },
    ease.outCubic,
  ],
  [0.7, { ...cheer, tF: 0.45, kF: 0.3, tB: -0.4, kB: 0.3, lift: 12 }, ease.inQuad],
  [0.78, dip, ease.inQuad],
  [0.88, { ...cheer, aF: 2.4, eF: 0.05 }, ease.outBack],
  [0.94, { ...cheer, aF: 1.6, eF: 1.0 }, ease.outQuad],
  [1, cheer, ease.outQuad],
]);
// ── specials (by special.kind) ────────────────────────────────────────────────────────
const beam = track([
  [0, {}],
  [
    0.22,
    {
      aF: -0.7,
      eF: 1.3,
      aB: -0.8,
      eB: 1.3,
      lean: -0.12,
      tF: 0.75,
      kF: 0.85,
      tB: -0.6,
      kB: 0.2,
      head: 0.1,
      fx: 0.4,
    },
    ease.outQuad,
  ],
  [
    0.38,
    {
      aF: 1.25,
      eF: 0.04,
      aB: 1.2,
      eB: 0.12,
      lean: 0.25,
      tF: 0.8,
      kF: 0.85,
      tB: -0.7,
      kB: 0.1,
      rx: 4,
      fx: 1,
      wind: 1,
    },
    ease.outExpo,
  ],
  [
    0.85,
    {
      aF: 1.25,
      eF: 0.06,
      aB: 1.2,
      eB: 0.14,
      lean: 0.22,
      tF: 0.8,
      kF: 0.85,
      tB: -0.7,
      kB: 0.1,
      rx: 1,
      fx: 1,
      wind: 1,
    },
  ],
  [1, {}],
]);

// Coil back with the orb cupped at the rear hip, then thrust both palms forward.
const projectile = track([
  [0, {}],
  [
    0.24,
    {
      aF: -0.25,
      eF: 1.85,
      aB: -0.35,
      eB: 1.85,
      lean: -0.3,
      head: 0.25,
      rx: -4,
      tF: 0.6,
      kF: 0.6,
      tB: -0.45,
      kB: 0.1,
      fx: 0.6,
      wind: 0.4,
    },
    ease.outQuad,
  ],
  [
    0.36,
    {
      aF: 1.3,
      eF: 0.06,
      aB: 1.25,
      eB: 0.14,
      lean: 0.36,
      tF: 0.75,
      kF: 0.75,
      tB: -0.65,
      kB: 0.05,
      rx: 6,
      fx: 1,
      wind: 0.8,
    },
    ease.outExpo,
  ],
  [
    0.62,
    {
      aF: 1.28,
      eF: 0.1,
      aB: 1.22,
      eB: 0.16,
      lean: 0.33,
      tF: 0.75,
      kF: 0.75,
      tB: -0.65,
      kB: 0.05,
      rx: 6,
      fx: 1,
    },
  ],
  [1, {}],
]);
const shockwave = track([
  [0, {}],
  [
    0.15,
    {
      tF: 1.05,
      kF: 1.75,
      tB: 0.45,
      kB: 1.75,
      lean: 0.4,
      aF: -0.4,
      aB: -0.5,
      eF: 0.8,
      eB: 0.8,
      sq: 0.9,
      fx: 0.3,
    },
    ease.outQuad,
  ],
  [
    0.33,
    {
      tF: 1.3,
      kF: 2.2,
      tB: 1.0,
      kB: 2.1,
      lean: -0.05,
      aF: 2.85,
      eF: 0.4,
      aB: 2.65,
      eB: 0.4,
      lift: 46,
      fx: 0.6,
      wind: 0.5,
    },
    ease.outCubic,
  ],
  [
    0.48,
    {
      tF: 1.28,
      kF: 2.12,
      tB: 0.5,
      kB: 2.3,
      lean: 0.62,
      aF: 0.95,
      eF: 0.08,
      aB: 0.6,
      eB: 0.4,
      lift: 0,
      sq: 0.86,
      fx: 1,
      wind: 1,
    },
    ease.inQuad,
  ],
  [
    0.8,
    {
      tF: 1.25,
      kF: 2.05,
      tB: 0.5,
      kB: 2.25,
      lean: 0.55,
      aF: 0.95,
      eF: 0.12,
      aB: 0.6,
      eB: 0.4,
      fx: 1,
      wind: 0.4,
    },
  ],
  [1, {}],
]);

const dashSpecial = track([
  [0, {}],
  [
    0.22,
    {
      lean: 0.5,
      tF: 1.0,
      kF: 1.4,
      tB: -0.2,
      kB: 1.0,
      aF: -0.8,
      aB: -1.0,
      eF: 0.8,
      eB: 0.8,
      fx: 0.4,
      sq: 0.94,
    },
    ease.outQuad,
  ],
  [
    0.3,
    {
      lean: 0.85,
      tF: 1.15,
      kF: 0.95,
      tB: -0.9,
      kB: 0.2,
      aF: 1.25,
      eF: 1.9,
      aB: -1.35,
      eB: 0.4,
      head: -0.45,
      fx: 1,
      wind: 1,
    },
    ease.outExpo,
  ],
  [
    0.72,
    {
      lean: 0.82,
      tF: 1.1,
      kF: 0.95,
      tB: -0.88,
      kB: 0.25,
      aF: 1.25,
      eF: 1.9,
      aB: -1.35,
      eB: 0.4,
      head: -0.45,
      fx: 1,
      wind: 1,
    },
  ],
  [0.85, { lean: 0.3, tF: 0.8, kF: 1.1, tB: -0.4, kB: 0.4, fx: 0 }],
  [1, {}],
]);

const teleport = track([
  [0, {}],
  [
    0.24,
    {
      aF: 1.05,
      eF: 1.85,
      aB: 1.15,
      eB: 1.75,
      head: 0.32,
      lean: 0.05,
      tF: 0.3,
      kF: 0.15,
      tB: -0.25,
      kB: 0.1,
      fx: 1,
    },
  ],
  [
    0.4,
    {
      aF: 1.05,
      eF: 1.85,
      aB: 1.15,
      eB: 1.75,
      head: 0.32,
      lean: 0.05,
      tF: 0.3,
      kF: 0.15,
      tB: -0.25,
      kB: 0.1,
      fx: 1,
      vis: 0,
    },
    ease.inBack,
  ],
  [0.58, { vis: 0, fx: 1 }],
  [
    0.7,
    {
      lean: 0.34,
      aF: 1.3,
      eF: 0.04,
      aB: 0.05,
      eB: 2.4,
      rx: 6,
      tF: 0.6,
      kF: 0.6,
      tB: -0.6,
      kB: 0.04,
      vis: 1,
      fx: 1,
    },
    ease.outExpo,
  ],
  [
    0.86,
    {
      lean: 0.32,
      aF: 1.28,
      eF: 0.1,
      aB: 0.05,
      eB: 2.4,
      rx: 6,
      tF: 0.6,
      kF: 0.6,
      tB: -0.6,
      kB: 0.04,
      fx: 0,
    },
  ],
  [1, {}],
]);

const SPECIALS: Record<Fighter['special']['kind'], Track> = {
  beam,
  projectile,
  shockwave,
  dash: dashSpecial,
  teleport,
};

const TRACKS: Record<Exclude<PoseId, 'special'>, Track> = {
  idle,
  walk,
  run,
  jump,
  crouch,
  punch,
  kick,
  uppercut,
  block,
  hurt,
  ko,
  victory,
  taunt,
  charge,
  dash,
  serve,
  smash,
  'kick-ball': kickBall,
  celebrate,
};

/** Joint state of `pose` at time t seconds (wrapped to the pose's loop). */
export function poseAt(pose: PoseId, t: number, kind: Fighter['special']['kind']): P {
  const loop = POSE_LOOP[pose] ?? 1;
  const u = (((t % loop) + loop) % loop) / loop;
  const tr = pose === 'special' ? SPECIALS[kind] : TRACKS[pose];
  return tr(u);
}

/** Phase 0..1 of a pose at time t. */
export const phase = (pose: PoseId, t: number) => {
  const loop = POSE_LOOP[pose] ?? 1;
  return (((t % loop) + loop) % loop) / loop;
};
