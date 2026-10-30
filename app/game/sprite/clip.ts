/**
 * Framed sprite clips — the 20 looping "GIFs" per original on the character page.
 *
 * Camera: ONE fixed character scale for every pose (a crouch reads low, a jump reads high).
 * The camera only pans — horizontally to centre the pose's whole-loop bounding box, and
 * vertically (lowering the floor) when a jump would leave the panel. Effects may leave frame.
 *
 * Staging: lettering sits up/behind the striking limb (never on the contact point), the struck
 * object (ball, shuttle, projectile target) is always visible at contact, and glow/rim/afterimage
 * colours are picked for contrast against each theme's backdrop. Pure for a given t.
 */
import type { DrawFn } from '~/lib/clips/ClipCanvas';
import type { Fighter } from '~/lib/schema';
import { alpha, INK, lum, mixHex } from '../engine/color';
import { clamp, ease, hash, lerp, TAU } from '../engine/math';
import {
  backdrop,
  bgColors,
  burstSize,
  burstWord,
  confetti,
  dust,
  floorBand,
  focusLines,
  frame,
  groundY,
  lightRays,
  speedLines,
} from './backdrop';
import { type Palette, ringFlash, span, star4 } from './fx';
import { CLIP_LOOP, CLIP_WARP, POSE_LOOP, type PoseId, poseAt, SPECIAL_WARP, warp } from './poses';
import { drawBall, drawShuttle } from './props';
import {
  capeGeo,
  DIMS,
  type DrawOpts,
  drawFighter,
  jointsAt,
  racketGeo,
  rigHeight,
  solve,
} from './rig';

interface Box {
  minX: number;
  maxX: number;
  minY: number;
}

const HEAD_TOP: Record<Fighter['rig']['head'], number> = {
  horns: 2.15,
  crown: 1.75,
  helmet: 1.5,
  visor: 1.5,
  hood: 1.5,
  mask: 1.15,
  bare: 1.2,
};

const boxes = new Map<string, Box>();
/** Bounding box (rig units, feet at 0) of the fighter's body over the entire loop of a pose. */
export function loopBox(f: Fighter, pose: PoseId): Box {
  const key = `${f.slug}|${f.rig.build}|${f.rig.head}|${f.rig.cape}|${f.special.kind}|${pose}`;
  const hit = boxes.get(key);
  if (hit) return hit;
  const d = DIMS[f.rig.build];
  const loop = POSE_LOOP[pose] ?? 1;
  const b: Box = { minX: Infinity, maxX: -Infinity, minY: Infinity };
  const add = (x: number, y: number, r: number) => {
    b.minX = Math.min(b.minX, x - r);
    b.maxX = Math.max(b.maxX, x + r);
    b.minY = Math.min(b.minY, y - r);
  };
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * loop;
    const p = poseAt(pose, t, f.special.kind);
    if (p.vis < 0.2) continue;
    const s = solve(p, d, 1, false);
    const r = d.legW * 0.6;
    for (const q of [
      s.pelvis,
      s.kneeF,
      s.kneeB,
      s.ankF,
      s.ankB,
      s.toeF,
      s.toeB,
      s.chest,
      s.elF,
      s.elB,
    ])
      add(q.x, q.y * p.sq, r);
    add(s.haF.x, s.haF.y * p.sq, d.hand + 2);
    add(s.haB.x, s.haB.y * p.sq, d.hand + 2);
    add(s.head.x, (s.head.y - s.headR * (HEAD_TOP[f.rig.head] - 1)) * p.sq, s.headR * 1.25);
    if (f.rig.head === 'hood') add(s.head.x - s.headR * 1.4, s.head.y, s.headR * 0.6);
    if (f.rig.cape) for (const q of capeGeo(s, d, t).outer) add(q.x, q.y * p.sq, 3);
    if (pose === 'serve' || pose === 'smash') {
      const rq = racketGeo(s).head;
      add(rq.x, rq.y * p.sq, 12);
    }
  }
  boxes.set(key, b);
  return b;
}

const contrast = (a: string, b: string) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** First theme colour that stands out on the backdrop (≥ 2.6:1), for rim, glow and afterimages. */
export function accentFor(f: Fighter): string {
  const bg = bgColors(f).base;
  const { c1, c2, c3 } = f.theme.palette;
  for (const c of [c1, c3, f.rig.trim, c2, f.rig.eye]) if (contrast(c, bg) >= 2.6) return c;
  return contrast('#ffffff', bg) > contrast(INK, bg) ? '#ffffff' : INK;
}

const WORDS: Partial<Record<PoseId, [u0: number, u1: number, word: string]>> = {
  punch: [0.27, 0.62, 'POW!'],
  kick: [0.4, 0.7, 'WHAM!'],
  uppercut: [0.36, 0.68, 'KRAK!'],
  hurt: [0.0, 0.45, 'OOF!'],
  ko: [0.0, 0.32, 'K.O.!'],
  smash: [0.53, 0.82, 'SMASH!'],
  serve: [0.48, 0.74, 'TOK!'],
  'kick-ball': [0.42, 0.72, 'THWACK!'],
  block: [0.06, 0.3, 'CLANK!'],
};
const SPECIAL_WORD: Record<Fighter['special']['kind'], [number, number, string]> = {
  beam: [0.42, 0.84, 'ZZRAAK!'],
  dash: [0.66, 0.92, 'VWOOSH!'],
  shockwave: [0.48, 0.84, 'BOOM!'],
  projectile: [0.5, 0.86, 'FWOOM!'],
  teleport: [0.68, 0.9, 'BZZT!'],
};
/** Moment of release for each special (flash frame). */
const RELEASE: Record<Fighter['special']['kind'], number> = {
  beam: 0.38,
  dash: 0.29,
  shockwave: 0.48,
  projectile: 0.36,
  teleport: 0.58,
};
/** Where (which joint, at which phase) each strike lands. */
const CONTACT: Partial<Record<PoseId, ['handF' | 'footF' | 'racket', number]>> = {
  punch: ['handF', 0.3],
  kick: ['footF', 0.42],
  uppercut: ['handF', 0.42],
  smash: ['racket', 0.53],
  serve: ['racket', 0.48],
  'kick-ball': ['footF', 0.42],
};

const ROOMY = new Set<PoseId>(['uppercut', 'hurt', 'smash', 'serve', 'kick-ball', 'special']);

const backOut = (k: number) => ease.outBack(clamp(k, 0, 1));

/** Treadmill speed for the dash clip: sprint, skid to a stop, spring off. */
const dashSpeed = (u: number) =>
  u < 0.55 ? 1 : u < 0.66 ? 1 - (u - 0.55) / 0.11 : u < 0.92 ? 0 : (u - 0.92) / 0.08;
function dashTravel(u: number) {
  let s = 0;
  const n = 48;
  for (let i = 0; i < n; i++) s += dashSpeed(((i + 0.5) / n) * u) * (u / n);
  return s;
}

const DASH_TOTAL = dashTravel(1);

/** headsOver() yields this many circles, first in bodyOver()'s list. */
const HEAD_SAMPLES = 7;

interface Circle {
  x: number;
  y: number;
  r: number;
}

/**
 * Where a sticker may go: the wanted spot if its box clears every head circle, otherwise the
 * first clear fallback (behind the head, below-behind, in front, top band, corners, sides).
 */
export function placeSticker(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  shape: 'burst' | 'bubble',
  want: { x: number; y: number },
  heads: Circle[],
  facing: 1 | -1,
  bounds: { w: number; h: number },
  /** Try the side the fighter faces before the side behind (speech bubbles: keep off the cape). */
  front = false,
  headCount?: number,
): { x: number; y: number } {
  const { rx: rx0, ry: ry0 } = burstSize(ctx, text, size, shape, bounds);
  const rx = rx0 * 1.15; // room for the pop overshoot and the spikes
  const ry = ry0 * 1.15;
  const clampIn = (p: { x: number; y: number }) => ({
    x: clamp(p.x, rx + 8, Math.max(rx + 8, bounds.w - rx - 8)),
    y: clamp(p.y, ry + 8, Math.max(ry + 8, bounds.h - ry - 8)),
  });
  const gapTo = (p: { x: number; y: number }, list: Circle[]) => {
    let worst = Infinity;
    for (const c of list) {
      const dx = Math.abs(p.x - c.x) - (rx + c.r);
      const dy = Math.abs(p.y - c.y) - (ry + c.r);
      worst = Math.min(worst, Math.max(dx, dy));
    }
    return worst;
  };
  // the first `headCount` circles are heads: those are a hard constraint
  const headList = heads.slice(0, headCount ?? heads.length);
  const h0 = headList[0] ?? { x: bounds.w / 2, y: bounds.h / 2, r: 0 };
  const hr = Math.max(0, ...headList.map((c) => c.r));
  const frontSpot = { x: h0.x + facing * (hr + rx + 6), y: h0.y - hr };
  const cands = [
    want,
    ...(front ? [frontSpot, { x: h0.x + facing * (hr * 0.4), y: h0.y - hr - ry - 4 }] : []),
    { x: want.x, y: want.y - ry },
    { x: h0.x - facing * (hr + rx + 6), y: h0.y - hr * 0.6 },
    { x: h0.x - facing * (hr + rx + 6), y: h0.y + hr + ry * 0.5 },
    { x: h0.x + facing * (hr + rx + 6), y: h0.y - hr },
    { x: bounds.w / 2, y: 0 },
    { x: 0, y: 0 },
    { x: bounds.w, y: 0 },
    { x: 0, y: bounds.h / 2 },
    { x: bounds.w, y: bounds.h / 2 },
  ].map(clampIn);
  // fallback grid over the whole panel
  for (let gy = 0; gy <= 4; gy++)
    for (let gx = 0; gx <= 4; gx++)
      cands.push(clampIn({ x: (bounds.w * gx) / 4, y: (bounds.h * gy) / 4 }));
  for (const c of cands) if (gapTo(c, heads) >= 0) return c;
  // nothing clears everything: never the head, then as clear of the rest as possible
  let best = cands[0] as { x: number; y: number };
  let bestGap = -Infinity;
  for (const c of cands) {
    if (gapTo(c, headList) < 0) continue;
    // prefer the open top band when everything is crowded
    const g = gapTo(c, heads) - (c.y / bounds.h) * ry * 0.8;
    if (g > bestGap) {
      bestGap = g;
      best = c;
    }
  }
  if (bestGap === -Infinity)
    for (const c of cands) if (gapTo(c, headList) > gapTo(best, headList)) best = c;
  return best;
}

/** A jagged impact star that pops out and fades; k = 0..1 life. */
function impactStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  col: string,
  size: number,
) {
  if (k <= 0 || k >= 1) return;
  const r = size * (0.5 + backOut(k / 0.35) * 0.6);
  ctx.save();
  ctx.globalAlpha *= 1 - span(k, 0.55, 1);
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * TAU + k * 0.6;
    const rr = i % 2 ? r * 0.42 : r * (0.85 + hash(i) * 0.3);
    i
      ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** A framed, themed, looping clip of one pose. */
export function spriteClip(fighter: Fighter, pose: PoseId): DrawFn {
  const loop = POSE_LOOP[pose] ?? 1;
  const pal: Palette = fighter.theme.palette;
  const kind = fighter.special.kind;
  const H = rigHeight(fighter);
  const box = loopBox(fighter, pose);
  const isSpecial = pose === 'special';
  const accent = accentFor(fighter);
  const gapCol = mixHex(accent, '#ffffff', 0.3);
  const clipLoop = CLIP_LOOP[pose] ?? loop;
  const warpTable = isSpecial ? SPECIAL_WARP[kind] : CLIP_WARP[pose];
  return (ctx, tRaw, w, h) => {
    // clip time drives ambient motion; the (warped) pose time drives the body
    const tc = ((tRaw % clipLoop) + clipLoop) % clipLoop;
    const u = warp(warpTable, tc / clipLoop);
    const t = u * loop;
    const scale = (h * 0.56) / H; // one scale for every pose
    // ── camera pan ──
    // poses whose lettering needs the top band get a little more headroom
    let gy = groundY(h) + (ROOMY.has(pose) ? h * 0.1 : 0);
    const over = -box.minY * scale - (gy - h * 0.05);
    if (over > 0) gy += over;
    const bounds = { w, h: Math.min(gy, h) };
    const side = w * 0.05;
    const mid = (box.minX + box.maxX) / 2;
    let cx = w / 2 - mid * scale;
    if ((box.maxX - box.minX) * scale < w - side * 2)
      cx = clamp(cx, side - box.minX * scale, w - side - box.maxX * scale);
    let facing: 1 | -1 = 1;
    let fade = 1;
    if (isSpecial && (kind === 'beam' || kind === 'projectile'))
      cx = side - box.minX * scale + w * 0.03;
    else if (isSpecial && kind === 'teleport') {
      facing = u < 0.5 ? 1 : -1;
      cx = u < 0.5 ? w * 0.3 - mid * scale : w * 0.7 + mid * scale;
    } else if (isSpecial && kind === 'dash') {
      cx += lerp(-w * 0.14, w * 0.12, span(u, 0.28, 0.72) ** 0.7);
      fade = Math.min(span(u, 0, 0.04), 1 - span(u, 0.94, 1));
    }
    const o: DrawOpts = { x: cx, y: gy, scale, facing, rim: accent, accent, gap: gapCol };
    const J = (tt: number) => jointsAt(fighter, pose, tt, o);
    /** Head circles (with headgear, padded ~12px) sampled over a phase window. */
    const headsOver = (u0: number, u1: number) => {
      const out: Circle[] = [];
      const fac = HEAD_TOP[fighter.rig.head];
      for (let i = 0; i <= 6; i++) {
        const j = J(lerp(u0, u1, i / 6) * loop);
        // headgear sits along the head's own up axis, which tilts with lean / head / topple
        const tilt = j.p.lean + j.p.head + j.p.rot;
        const up = j.headR * (fac - 1) * 0.55;
        out.push({
          x:
            j.head.x +
            Math.sin(tilt) * up * facing -
            (fighter.rig.head === 'hood' ? j.headR * 0.4 * facing : 0),
          y: j.head.y - Math.cos(tilt) * up,
          r: j.headR * (0.55 + fac * 0.5) + 10 * (w / 220),
        });
      }
      return out;
    };
    /** Head circles plus torso and hips: stickers should not sit on the body either. */
    const bodyOver = (u0: number, u1: number) => {
      const out = headsOver(u0, u1);
      const d = DIMS[fighter.rig.build];
      for (let i = 0; i <= 4; i++) {
        const j = J(lerp(u0, u1, i / 4) * loop);
        const r = d.sw * scale * 0.55 + 3;
        out.push({ x: (j.chest.x + j.pelvis.x) / 2, y: (j.chest.y + j.pelvis.y) / 2, r });
        out.push({ x: j.pelvis.x, y: j.pelvis.y + d.thigh * scale * 0.45, r: r * 0.8 });
      }
      // the cape (lettering on a cape reads as a costume print)
      if (fighter.rig.cape)
        for (let i = 0; i <= 2; i++) {
          const tt = lerp(u0, u1, i / 2) * loop;
          const p = poseAt(pose, tt, fighter.special.kind);
          const g = capeGeo(solve(p, d, 1, false), d, tt);
          for (const q of [...g.inner, ...g.outer])
            out.push({ x: o.x + q.x * scale * facing, y: o.y + q.y * scale * p.sq, r: 5 * scale });
        }
      // the striking hardware: fists, lead foot, the contact point, and any ball / shuttle in play
      const pad = 6 * (w / 220);
      for (let i = 0; i <= 6; i++) {
        const uu = lerp(u0, u1, i / 6);
        const j = J(uu * loop);
        out.push({ x: j.handF.x, y: j.handF.y, r: d.hand * scale + pad });
        out.push({ x: j.handB.x, y: j.handB.y, r: d.hand * scale + pad });
        out.push({ x: j.footF.x, y: j.footF.y, r: d.legW * scale * 0.5 + pad });
        out.push({ x: j.footB.x, y: j.footB.y, r: d.legW * scale * 0.5 + pad });
        out.push({
          x: (j.pelvis.x + j.footF.x) / 2,
          y: (j.pelvis.y + j.footF.y) / 2,
          r: d.legW * scale * 0.6 + pad,
        });
        out.push({
          x: (j.pelvis.x + j.footB.x) / 2,
          y: (j.pelvis.y + j.footB.y) / 2,
          r: d.legW * scale * 0.6 + pad,
        });
        if (pose === 'kick-ball') {
          const b = ballPos(fighter, o, uu, w, h, gy, scale);
          out.push({ x: b.x, y: b.y, r: b.r + pad });
        }
        if (pose === 'serve' || pose === 'smash') {
          const q = shuttlePos(fighter, pose, o, uu, w, gy, scale);
          if (q) out.push({ x: q.x, y: q.y, r: 9 * scale + pad });
        }
      }
      const c = CONTACT[pose];
      if (c) {
        const j = J(c[1] * loop);
        const pt = c[0] === 'racket' ? j.racket : j[c[0]];
        out.push({ x: pt.x, y: pt.y, r: 16 * scale + pad });
      }
      return out;
    };

    // ── camera shake on impact ──
    const word = isSpecial ? SPECIAL_WORD[kind] : WORDS[pose];
    let shake = 0;
    if (word && u >= word[0] && u < word[0] + 0.07) shake = 4 * (1 - (u - word[0]) / 0.07);
    if (pose === 'hurt' && u < 0.42) shake = 3 * (1 - u / 0.42);
    if (isSpecial && kind === 'shockwave' && u > 0.48 && u < 0.62)
      shake = 7 * (1 - span(u, 0.48, 0.62));
    const kickUp = pose === 'uppercut' && u > 0.36 && u < 0.46 ? -4 : 0;
    const sx = shake * Math.sin(t * 97);
    const sy = shake * Math.cos(t * 83) + kickUp;

    ctx.save();
    ctx.translate(sx, sy);
    backdrop(ctx, w, h, fighter, tc, pose);
    if (pose === 'victory') lightRays(ctx, cx, gy - H * scale * 0.55, h * 1.1, tc, pal);

    // treadmill for run / dash (dash sprints, skids, springs off)
    const runK = pose === 'run' ? 0.7 : pose === 'dash' ? dashSpeed(u) : 0;
    // loop distance is a whole number of floor tiles (60px) so the treadmill wraps seamlessly
    const scroll =
      pose === 'run' ? u * 120 : pose === 'dash' ? (dashTravel(u) / DASH_TOTAL) * 180 : 0;
    const fastSpecial = isSpecial && kind === 'dash' && u > 0.25 && u < 0.75;
    if (runK > 0.02 || fastSpecial)
      speedLines(ctx, w, h, tc, { ...pal, c3: accent }, fastSpecial ? 1 : runK);
    const impact = word && u >= word[0] && u <= word[1] ? span(u, word[0], word[1]) : -1;
    if (impact >= 0 && impact < 0.4 && pose !== 'hurt' && pose !== 'block')
      focusLines(ctx, w, h, tc, pal, 1 - impact / 0.4);
    floorBand(ctx, w, h, fighter, tc, 0, gy, scroll);

    // ── behind the fighter ──
    if ((pose === 'dash' && u < 0.6) || (isSpecial && kind === 'dash' && u > 0.29 && u < 0.72)) {
      const k = pose === 'dash' ? dashSpeed(u) : 1;
      for (let i = 2; i >= 1; i--) {
        const back = i * 0.05;
        const px = pose === 'dash' ? cx - i * 30 * scale * k : cx - i * 22 * scale;
        void back;
        drawFighter(ctx, fighter, pose, t, {
          ...o,
          x: px,
          alpha: i === 1 ? 0.45 : 0.25,
          ghost: mixHex(accent, INK, 0.2),
          shadow: false,
          smear: false,
        });
      }
    }
    if (pose === 'charge') inwardMotes(ctx, cx, gy - H * scale * 0.5, H * scale, t, accent);

    // ── the fighter ──
    ctx.save();
    ctx.globalAlpha = fade;
    drawFighter(ctx, fighter, pose, t, { ...o, orb: !(isSpecial && kind === 'projectile') });
    ctx.restore();

    // ── props + extras (in front) ──
    if (pose === 'kick-ball') kickBall(ctx, fighter, o, u, w, h, gy, scale, pal, accent);
    if (pose === 'serve' || pose === 'smash')
      shuttlePlay(ctx, fighter, pose, o, u, w, gy, scale, pal, accent);
    if (pose === 'run') {
      dust(ctx, cx - 12 * scale, gy, (u * 2) % 1, pal, scale * 0.7);
      dust(ctx, cx + 6 * scale, gy, (u * 2 + 0.5) % 1, pal, scale * 0.5);
    }
    if (pose === 'dash') {
      if (u > 0.58 && u < 0.92)
        for (const k0 of [0.58, 0.68, 0.78])
          dust(ctx, J(t).footF.x + 8 * scale, gy, span(u, k0, k0 + 0.16), pal, scale * 0.8);
      else dust(ctx, cx - 18 * scale, gy, (u * 4) % 1, pal, scale * 0.6);
    }
    if (pose === 'jump') {
      dust(ctx, cx, gy, span(u, 0.14, 0.42), pal, scale);
      dust(ctx, cx, gy, span(u, 0.8, 1), pal, scale);
    }
    if (pose === 'crouch')
      dust(ctx, cx + 10 * scale * Math.sin(u * TAU), gy, (u * 2) % 1, pal, scale * 0.4);
    if (isSpecial && kind === 'shockwave') dust(ctx, cx, gy, span(u, 0.48, 0.85), pal, scale * 1.4);
    if (pose === 'uppercut') dust(ctx, cx, gy, span(u, 0.22, 0.5), pal, scale);
    if (pose === 'smash') dust(ctx, cx, gy, span(u, 0.78, 1), pal, scale);
    if (pose === 'celebrate') {
      dust(ctx, cx, gy, span(u, 0.36, 0.5), pal, scale * 0.8);
      dust(ctx, cx, gy, span(u, 0.78, 0.95), pal, scale);
    }
    if (pose === 'ko') koStars(ctx, fighter, o, t, u, scale, pal, gy, cx);
    if (pose === 'victory') confetti(ctx, w, h, tc, pal, 16);
    if (pose === 'celebrate') {
      confetti(ctx, w, h, tc, pal, 14);
      const j = J(0.52 * loop);
      confettiBurst(ctx, j.head.x, j.head.y, Math.max(0, (u - 0.52) * loop), pal, scale);
    }
    if (pose === 'charge') {
      // fists clench on the beat: a ring snaps around each fist
      const j = J(t);
      const beat = (u * 4) % 1;
      if (beat < 0.3) {
        ringFlash(ctx, j.handF.x, j.handF.y, beat / 0.3, { ...pal, c3: accent }, 22 * scale);
      }
    }
    if (pose === 'taunt') {
      const j = J(0);
      const pop =
        u < 0.14
          ? backOut(u / 0.14)
          : u > 0.9
            ? 1 - span(u, 0.9, 1)
            : 1 + 0.04 * Math.sin(u * TAU * 2);
      const at = placeSticker(
        ctx,
        'BRING IT!',
        h * 0.075,
        'bubble',
        { x: j.head.x + 46 * scale, y: j.head.y - 30 * scale },
        bodyOver(0, 1),
        facing,
        bounds,
        true,
        HEAD_SAMPLES,
      );
      burstWord(
        ctx,
        at.x,
        at.y,
        'BRING IT!',
        h * 0.075,
        -0.1,
        pal,
        'bubble',
        bounds,
        pop,
        at.x < j.head.x ? 1 : -1,
      );
    }
    if (pose === 'hurt') sweat(ctx, fighter, o, t, u, scale);
    if (pose === 'block') {
      for (const hitU of [0.06, 0.56]) {
        const k = span(u, hitU, hitU + 0.22);
        if (k > 0 && k < 1) {
          const j = J(hitU * loop);
          const x = Math.max(j.handF.x, j.handB.x) + 30 * scale;
          const y = j.chest.y;
          impactStar(ctx, x, y, k, accent, 16 * scale);
          for (let i = 0; i < 6; i++) {
            const a = (i - 2.5) * 0.45;
            const r = (10 + k * 40) * scale * 0.6;
            ctx.fillStyle = '#ffffff';
            star4(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 4 * scale * (1 - k), 1.2 * scale);
          }
        }
      }
    }

    // contact: impact star + ring exactly where the limb lands
    const c = CONTACT[pose];
    let contactPt: { x: number; y: number } | null = null;
    if (c) {
      const j = J(c[1] * loop);
      contactPt = c[0] === 'racket' ? j.racket : j[c[0]];
      const k = span(u, c[1], c[1] + (pose === 'serve' || pose === 'smash' ? 0.08 : 0.2));
      if (pose === 'punch' || pose === 'kick' || pose === 'uppercut')
        impactStar(ctx, contactPt.x, contactPt.y, k, accent, 15 * scale);
      ringFlash(ctx, contactPt.x, contactPt.y, k, { ...pal, c3: accent }, 30 * scale);
    }

    // special payoffs: every kind gets a hit frame
    if (isSpecial) specialPayoff(ctx, fighter, o, u, w, gy, scale, pal, accent);

    // special release flash (a frame or two)
    if (isSpecial) {
      const r = RELEASE[kind];
      const k = span(u, r, r + 0.06);
      if (k > 0 && k < 1) {
        // a local flash at the hands, not a full-panel white-out
        const j = J(r * loop);
        impactStar(
          ctx,
          (j.handF.x + j.handB.x) / 2,
          (j.handF.y + j.handB.y) / 2,
          k,
          accent,
          26 * scale,
        );
      }
    }

    // lettering: up / behind the striking limb; hard rule — never on the head
    if (word?.[2] && impact >= 0) {
      const head = J(t).head;
      let want: { x: number; y: number };
      if (pose === 'uppercut') want = { x: head.x - 58 * scale * facing, y: head.y + 26 * scale };
      else if (pose === 'smash' || pose === 'serve' || pose === 'kick-ball' || pose === 'block')
        want = { x: head.x - 64 * scale * facing, y: head.y - 30 * scale };
      else if (contactPt)
        want = { x: contactPt.x + 4 * scale * facing, y: contactPt.y - 46 * scale };
      else if (pose === 'hurt' || pose === 'ko')
        want = { x: head.x + 40 * scale * facing, y: head.y - 40 * scale };
      else want = { x: cx < w / 2 ? w * 0.72 : w * 0.28, y: h * 0.15 };
      const size = Math.min(w, h) * (isSpecial ? 0.095 : 0.088) * Math.min(1, 5.5 / word[2].length);
      const at = placeSticker(
        ctx,
        word[2],
        size,
        'burst',
        want,
        bodyOver(word[0], word[1]),
        facing,
        bounds,
        false,
        HEAD_SAMPLES,
      );
      const pop = backOut(impact / 0.14);
      // opaque throughout: pops in, holds, snaps shut (no translucent ghost)
      const out = 1 - ease.inBack(span(impact, 0.62, 0.78));
      ctx.save();
      burstWord(
        ctx,
        at.x,
        at.y,
        word[2],
        size,
        -0.12 + hash(word[2].length) * 0.24,
        pal,
        'burst',
        bounds,
        pop * Math.max(0, out),
      );
      ctx.restore();
    }
    ctx.restore();
    frame(ctx, w, h);
  };
}

/** Every special lands on something: an impact at the end of the beam, orb, dash or strike. */
function specialPayoff(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  o: DrawOpts,
  u: number,
  w: number,
  gy: number,
  scale: number,
  pal: Palette,
  accent: string,
) {
  const kind = f.special.kind;
  const loop = POSE_LOOP.special ?? 1;
  const at = (uu: number) => jointsAt(f, 'special', uu * loop, o);
  if (kind === 'beam') {
    const j = at(0.45);
    const y = (j.handF.y + j.handB.y) / 2;
    const k = span(u, 0.42, 0.86);
    if (k > 0 && k < 1) {
      const pulse = (u * 9) % 1;
      impactStar(ctx, w * 0.93, y, 0.2 + pulse * 0.3, accent, 26 * scale);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + (hash(i + Math.floor(u * 30)) - 0.5) * 2;
        const r = (12 + hash(i + 3) * 30) * scale;
        ctx.fillStyle = i % 2 ? pal.c3 : '#ffffff';
        star4(ctx, w * 0.93 + Math.cos(a) * r, y + Math.sin(a) * r, 4 * scale, 1.2 * scale);
      }
    }
  } else if (kind === 'projectile') {
    const j = at(0.36);
    const target = { x: w * 0.84, y: j.handF.y };
    if (u >= 0.36 && u < 0.5) {
      const k = (u - 0.36) / 0.14;
      energyBall(
        ctx,
        lerp(j.handF.x, target.x, k),
        lerp(j.handF.y, target.y, k),
        11 * scale,
        u * loop,
        pal,
        accent,
        (target.x - j.handF.x) * 0.06,
      );
    }
    const k = span(u, 0.5, 0.8);
    if (k > 0 && k < 1) {
      impactStar(ctx, target.x, target.y, k, accent, 34 * scale);
      ringFlash(ctx, target.x, target.y, k, { ...pal, c3: accent }, 60 * scale);
      for (let i = 0; i < 10; i++) {
        const a = hash(i + 20) * TAU;
        const r = (10 + k * 60) * scale * (0.6 + hash(i + 21) * 0.6);
        ctx.fillStyle = i % 2 ? pal.c3 : accent;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
          target.x + Math.cos(a) * r,
          target.y + Math.sin(a) * r + k * k * 20 * scale,
          3 * scale * (1 - k),
          0,
          TAU,
        );
        ctx.fill();
        ctx.stroke();
      }
    }
  } else if (kind === 'dash') {
    const k = span(u, 0.66, 0.86);
    if (k > 0 && k < 1) {
      const j = at(0.66);
      impactStar(ctx, j.chest.x + 34 * scale, j.chest.y + 6 * scale, k, accent, 28 * scale);
    }
  } else if (kind === 'teleport') {
    const k = span(u, 0.68, 0.88);
    if (k > 0 && k < 1) {
      const j = at(0.7);
      impactStar(ctx, j.handF.x - 10 * scale, j.handF.y, k, accent, 26 * scale);
    }
  } else if (kind === 'shockwave') {
    const k = span(u, 0.48, 0.7);
    if (k > 0 && k < 1) impactStar(ctx, o.x + 20 * scale, gy - 6 * scale, k, accent, 30 * scale);
  }
  void w;
}

function inwardMotes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  t: number,
  col: string,
) {
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const ph = (t * 1.3 + hash(i + 300)) % 1;
    const a = hash(i + 301) * TAU;
    const r = size * (0.9 - ph * 0.75);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.8;
    ctx.strokeStyle = alpha(i % 2 ? col : '#ffffff', 0.45 + ph * 0.55);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(a) * size * 0.08, py - Math.sin(a) * size * 0.064);
    ctx.stroke();
  }
  // rising sparks
  for (let i = 0; i < 10; i++) {
    const ph = (t * 0.9 + hash(i + 350)) % 1;
    ctx.fillStyle = alpha(i % 2 ? col : '#ffffff', 1 - ph);
    star4(ctx, x + (hash(i + 351) * 2 - 1) * size * 0.45, y + size * 0.5 - ph * size * 1.2, 3.5, 1);
  }
  ctx.restore();
}

function confettiBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tt: number,
  pal: Palette,
  s: number,
) {
  if (tt <= 0 || tt > 1.2) return;
  const cols = [pal.c1, pal.c3, '#ffffff', pal.c2];
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  for (let i = 0; i < 30; i++) {
    const a = hash(i + 400) * TAU;
    const v = (90 + hash(i + 401) * 130) * s;
    const px = x + Math.cos(a) * v * tt;
    const py = y + Math.sin(a) * v * tt - 60 * s * tt + 160 * s * tt * tt;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(tt * 12 + i);
    ctx.fillStyle = cols[i % cols.length] ?? '#fff';
    ctx.fillRect(-1.75 * s, -1 * s, 3.5 * s, 2 * s);
    ctx.strokeRect(-1.75 * s, -1 * s, 3.5 * s, 2 * s);
    ctx.restore();
  }
  ctx.restore();
}

function kickBall(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  o: DrawOpts,
  u: number,
  w: number,
  h: number,
  gy: number,
  scale: number,
  pal: Palette,
  accent: string,
) {
  const b = ballPos(f, o, u, w, h, gy, scale);
  if (b.k > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    const pts = Array.from({ length: 8 }, (_, i) =>
      ballPos(f, o, Math.max(0.42, u - i * 0.015), w, h, gy, scale),
    );
    for (const [lw, col] of [
      [b.r * 1.6 + 3, INK],
      [b.r * 1.6, accent],
      [b.r * 0.7, '#ffffff'],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (const [i, q] of pts.entries()) {
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = alpha(INK, 0.3);
  ctx.beginPath();
  ctx.ellipse(b.x, gy + 1, b.r * clamp(1 - (gy - b.r - b.y) / 200, 0.3, 1), 3, 0, 0, TAU);
  ctx.fill();
  drawBall(ctx, b.x, b.y, b.r, b.spin, pal.c3);
}

/** Filled energy ball with a tapering trail (works on light and dark pages: no additive blending). */
function energyBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  pal: Palette,
  accent: string,
  step: number,
) {
  for (let i = 6; i >= 1; i--) {
    ctx.fillStyle = mixHex(accent, i % 2 ? pal.c3 : '#ffffff', 0.25);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x - step * i * 0.9, y + Math.sin(t * 30 + i) * r * 0.08, r * (1 - i * 0.12), 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.15, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = mixHex(pal.c3, '#ffffff', 0.4);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.75, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 9);
  ctx.fillStyle = '#ffffff';
  star4(ctx, 0, 0, r * 0.95, r * 0.28);
  ctx.restore();
}

/** Ball position at phase u (pure): drops in, rests against the toe, flies off after contact. */
function ballPos(
  f: Fighter,
  o: DrawOpts,
  u: number,
  w: number,
  h: number,
  gy: number,
  scale: number,
) {
  const loop = POSE_LOOP['kick-ball'] ?? 1;
  const r = 8 * scale;
  const toe = jointsAt(f, 'kick-ball', 0.42 * loop, o).toeF;
  const rest = toe.x + r * 0.85;
  if (u < 0.3) {
    const k = u / 0.3;
    const hop =
      k < 0.45
        ? 1 - (k / 0.45) ** 2
        : k < 0.78
          ? 0.3 * Math.sin(((k - 0.45) / 0.33) * Math.PI)
          : 0.08 * Math.sin(((k - 0.78) / 0.22) * Math.PI);
    return { x: rest, y: gy - r - hop * h * 0.55, r, spin: k * 3, k: -1 };
  }
  if (u < 0.42) return { x: rest, y: gy - r, r, spin: 3, k: -1 };
  const k = (u - 0.42) / 0.58;
  return {
    x: rest + k * w * 1.25,
    y: gy - r - Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * h * 0.38,
    r,
    spin: k * 40,
    k,
  };
}

/** Shuttle position at phase u (pure), or null when it is out of play. */
function shuttlePos(
  f: Fighter,
  pose: PoseId,
  o: DrawOpts,
  u: number,
  w: number,
  gy: number,
  scale: number,
) {
  const loop = POSE_LOOP[pose] ?? 1;
  if (pose === 'serve') {
    const contact = jointsAt(f, pose, 0.48 * loop, o).racket;
    if (u < 0.32) {
      const hb = jointsAt(f, pose, u * loop, o).handB;
      return { x: hb.x + 4 * scale, y: hb.y + 2 * scale, a: Math.PI / 2 };
    }
    if (u < 0.48) {
      const k = (u - 0.32) / 0.16;
      const hb = jointsAt(f, pose, 0.32 * loop, o).handB;
      // dropped from the hand, it falls onto the racket's path
      return {
        x: lerp(hb.x + 4 * scale, contact.x, k),
        y: lerp(hb.y + 2 * scale, contact.y, k * k),
        a: Math.PI / 2,
      };
    }
    const k = (u - 0.48) / 0.4;
    if (k > 1.2) return null;
    const p = (kk: number) => ({
      x: contact.x + kk * w * 0.85,
      y: contact.y - Math.sin(Math.min(kk, 1) * Math.PI * 0.8) * gy * 0.5 + kk * kk * gy * 0.15,
    });
    const a = p(k);
    const b = p(k + 0.01);
    return { x: a.x, y: a.y, a: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  const contact = jointsAt(f, pose, 0.53 * loop, o).racket;
  const land = { x: Math.min(w * 0.92, contact.x + w * 0.42), y: gy - 2 };
  if (u <= 0.2) return null;
  if (u < 0.53) {
    const k = (u - 0.2) / 0.33;
    return {
      x: lerp(contact.x + 40 * scale, contact.x, k),
      y: lerp(-10, contact.y, k),
      a: Math.PI / 2 + 0.3,
    };
  }
  const k = clamp((u - 0.53) / 0.12, 0, 1);
  return {
    x: lerp(contact.x, land.x, k),
    y: lerp(contact.y, land.y, k),
    a: Math.atan2(land.y - contact.y, land.x - contact.x),
  };
}

function shuttlePlay(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  pose: PoseId,
  o: DrawOpts,
  u: number,
  w: number,
  gy: number,
  scale: number,
  pal: Palette,
  accent: string,
) {
  const sz = scale * 0.9;
  const q = shuttlePos(f, pose, o, u, w, gy, scale);
  const hitU = pose === 'serve' ? 0.48 : 0.53;
  // streak behind the shuttle once it has been struck
  if (q && u > hitU + 0.005) {
    const pts = Array.from({ length: 8 }, (_, i) =>
      shuttlePos(f, pose, o, Math.max(hitU, u - i * 0.012), w, gy, scale),
    ).filter((p): p is NonNullable<typeof p> => !!p);
    ctx.save();
    ctx.lineCap = 'round';
    for (const [lw, col] of [
      [7 * sz, INK],
      [4.5 * sz, mixHex(accent, '#ffffff', 0.4)],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (const [i, p] of pts.entries()) {
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (pose === 'smash' && u >= 0.65) {
    const land = shuttlePos(f, pose, o, 0.66, w, gy, scale);
    const kk = span(u, 0.65, 0.88);
    if (land) {
      impactStar(ctx, land.x, land.y - 4 * scale, kk, accent, 18 * scale);
      dust(ctx, land.x, gy, kk, pal, scale * 0.8);
    }
  }
  if (q) drawShuttle(ctx, q.x, q.y, q.a, sz);
}

function koStars(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  o: DrawOpts,
  t: number,
  u: number,
  scale: number,
  pal: Palette,
  gy: number,
  cx: number,
) {
  const j = jointsAt(f, 'ko', t, o);
  if (u > 0.5) {
    for (let i = 0; i < 4; i++) {
      const a = t * 4 + (i / 4) * TAU;
      ctx.fillStyle = i % 2 ? pal.c3 : '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      const x = j.head.x + Math.cos(a) * 16 * scale;
      const y = j.head.y - 14 * scale + Math.sin(a) * 5 * scale;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const aa = (k / 10) * TAU - Math.PI / 2;
        const r = (k % 2 ? 2.2 : 5) * scale * 0.9;
        k
          ? ctx.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r)
          : ctx.moveTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  dust(ctx, cx - 20 * scale, gy, span(u, 0.38, 0.6), pal, scale);
}

function sweat(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  o: DrawOpts,
  t: number,
  u: number,
  scale: number,
) {
  const j = jointsAt(f, 'hurt', t, o);
  for (let i = 0; i < 3; i++) {
    const k = span(u, 0.1 + i * 0.04, 0.55 + i * 0.04);
    if (k <= 0 || k >= 1) continue;
    ctx.fillStyle = '#9fe6ff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    const x = j.head.x + (i - 1) * 9 * scale - k * 8 * scale;
    const y = j.head.y - 14 * scale - k * 12 * scale + k * k * 22 * scale;
    ctx.beginPath();
    ctx.moveTo(x, y - 4 * scale);
    ctx.quadraticCurveTo(x + 3 * scale, y + 1 * scale, x, y + 2.5 * scale);
    ctx.quadraticCurveTo(x - 3 * scale, y + 1 * scale, x, y - 4 * scale);
    ctx.fill();
    ctx.stroke();
  }
}
