/** Pure rules for the brawler: move table, damage, hit tests, round scoring. Unit-tested. */
import type { Fighter } from '~/lib/schema';
import type { PoseId } from '../sprite/poses';

export type AttackId = 'punch' | 'kick' | 'uppercut' | 'special';

export interface AttackDef {
  pose: PoseId;
  /** seconds for the whole move */
  dur: number;
  /** active window as a fraction of dur */
  active: [number, number];
  joint: 'handF' | 'footF';
  r: number;
  dmg: number;
  kb: number;
  launch: number;
  stun: number;
  stop: number;
  meter: number;
  word: string;
  /** extra recovery (s) when the attack is blocked: blocked hits cost the attacker */
  blockLag: number;
}

export const ATTACKS: Record<Exclude<AttackId, 'special'>, AttackDef> = {
  punch: {
    pose: 'punch',
    dur: 0.34,
    active: [0.26, 0.5],
    joint: 'handF',
    r: 22,
    dmg: 6,
    kb: 200,
    launch: 0,
    // short enough that a jab can't link into another jab (only chains combo)
    stun: 0.24,
    stop: 4,
    meter: 7,
    word: 'POW!',
    blockLag: 0.1,
  },
  kick: {
    pose: 'kick',
    dur: 0.5,
    active: [0.3, 0.56],
    joint: 'footF',
    r: 26,
    dmg: 9,
    kb: 320,
    launch: 0,
    stun: 0.32,
    stop: 6,
    meter: 9,
    word: 'WHAM!',
    blockLag: 0.14,
  },
  uppercut: {
    pose: 'uppercut',
    dur: 0.56,
    // The fist rises from the hip to over the head; the sim sweeps it, so the window opens on
    // the rising arc (a standing opponent at close range is hit, not just jumpers).
    active: [0.22, 0.5],
    joint: 'handF',
    r: 26,
    dmg: 11,
    kb: 140,
    launch: -640,
    stun: 0.55,
    stop: 8,
    meter: 11,
    word: 'KRAK!',
    blockLag: 0.22,
  },
};

export const SPECIAL_COST = 50;
/** Extra recovery when a melee special is blocked. */
export const SPECIAL_BLOCK_LAG = 0.2;
/** Presses are remembered this long (≈6 frames) so chains and reversals register reliably. */
export const BUFFER = 0.1;
/** Counter-hit (hitting someone mid-attack) bonus. */
export const COUNTER_DMG = 1.2;
/** Guard gauge: each blocked hit fills it by GUARD_BASE + dmg / GUARD_PER_DMG; full = guard break. */
export const GUARD_BASE = 0.1;
export const GUARD_PER_DMG = 70;
/** Gauge drains at this rate once the fighter hasn't blocked for GUARD_REST seconds. */
export const GUARD_DRAIN = 0.35;
export const GUARD_REST = 0.6;
/** Stagger after a guard break (s). */
export const GUARD_BREAK_STUN = 0.7;
/** Below this health fraction a fighter builds meter faster (comeback). */
export const RAGE_AT = 0.3;
export const SPECIAL_DUR = 1.0;

/** Special timing/damage per kind (u = fraction of SPECIAL_DUR). */
export const SPECIAL: Record<
  Fighter['special']['kind'],
  { active: [number, number]; dmg: number; kb: number; launch: number; word: string }
> = {
  beam: { active: [0.38, 0.84], dmg: 17, kb: 460, launch: -200, word: 'ZZRAAK!' },
  projectile: { active: [0.36, 0.37], dmg: 14, kb: 380, launch: -150, word: 'FWOOM!' },
  shockwave: { active: [0.48, 0.62], dmg: 16, kb: 300, launch: -560, word: 'BOOM!' },
  dash: { active: [0.28, 0.72], dmg: 15, kb: 520, launch: -250, word: 'VWOOSH!' },
  teleport: { active: [0.64, 0.82], dmg: 14, kb: 380, launch: -380, word: 'BZZT!' },
};

/** Damage after stats and combo scaling. Always ≥ 1. */
export function damage(
  base: number,
  atk: Fighter['stats'],
  def: Fighter['stats'],
  comboHits: number,
  special = false,
): number {
  const power = special ? 0.75 + atk.special * 0.05 : 0.8 + atk.power * 0.04;
  const guard = 1.12 - def.defense * 0.03;
  const scale = 0.88 ** Math.max(0, comboHits);
  return Math.max(1, Math.round(base * power * guard * scale * 10) / 10);
}

export const CHIP = 0.15;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function circleRect(cx: number, cy: number, r: number, b: Rect): boolean {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

export function rectRect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Hurtbox for a fighter standing at (x, feetY). */
export function hurtbox(
  x: number,
  feetY: number,
  height: number,
  width: number,
  crouching: boolean,
): Rect {
  const h = crouching ? height * 0.62 : height;
  return { x: x - width / 2, y: feetY - h, w: width, h };
}

export const ROUNDS_TO_WIN = 2;
export const ROUND_TIME = 60;

/** Who takes a round: KO decides; on time-out the higher health fraction wins; equal = draw. */
export function roundWinner(hp: [number, number], max: [number, number]): 0 | 1 | -1 {
  if (hp[0] <= 0 && hp[1] <= 0) return -1;
  if (hp[1] <= 0) return 0;
  if (hp[0] <= 0) return 1;
  const a = hp[0] / max[0];
  const b = hp[1] / max[1];
  if (Math.abs(a - b) < 1e-6) return -1;
  return a > b ? 0 : 1;
}

/** Health fractions closer than this on time-out count as level; points decide. */
export const POINTS_MARGIN = 0.02;

/**
 * Time-out decision: clearly more health (fraction) wins; otherwise the busier fighter on
 * points (hits landed, attacks thrown, hits blocked) takes it; dead level = draw.
 */
export function timeoutWinner(
  hp: [number, number],
  max: [number, number],
  pts: [number, number],
): { winner: 0 | 1 | -1; by: 'health' | 'points' | 'draw' } {
  const a = hp[0] / max[0];
  const b = hp[1] / max[1];
  if (Math.abs(a - b) >= POINTS_MARGIN) return { winner: a > b ? 0 : 1, by: 'health' };
  if (pts[0] !== pts[1]) return { winner: pts[0] > pts[1] ? 0 : 1, by: 'points' };
  return { winner: -1, by: 'draw' };
}

/** Points toward a time-out decision. */
export const POINTS = { attack: 1, hit: 3, block: 1 };

/** Match winner once someone has ROUNDS_TO_WIN, or after `maxRounds`. null = keep playing. */
export function matchWinner(
  wins: [number, number],
  roundsPlayed: number,
  maxRounds = 5,
): 0 | 1 | -1 | null {
  if (wins[0] >= ROUNDS_TO_WIN) return 0;
  if (wins[1] >= ROUNDS_TO_WIN) return 1;
  if (roundsPlayed >= maxRounds) return wins[0] === wins[1] ? -1 : wins[0] > wins[1] ? 0 : 1;
  return null;
}

export const maxHp = (f: Fighter) => 90 + f.stats.defense * 4;
export const walkSpeed = (f: Fighter) => 190 + f.stats.speed * 16;
