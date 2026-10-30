/** Shuttlecock physics + court rules for Smash Court. Pure and unit-tested. */

export const GY = 470;
export const NET_X = 480;
export const NET_TOP = 336;
export const COURT_L = 56;
export const COURT_R = 904;
export const GRAV = 980;
/** Quadratic drag — a shuttle's terminal speed is low, so long shots "die" and fall steeply. */
export const DRAG = 0.0021;

export interface Shuttle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Visual orientation (cork leads), lags the velocity to show the flip after a hit. */
  angle: number;
}

export type ShotType = 'clear' | 'drop' | 'smash' | 'drive' | 'serve-high' | 'serve-short';

/** Launch elevation per shot (vertical speed, px/s; negative = up). */
const LIFT: Record<ShotType, number> = {
  clear: -820,
  'serve-high': -860,
  drop: -470,
  'serve-short': -500,
  drive: -280,
  smash: 0,
};

/** Default landing target for a shot hit toward `dir`. */
export function shotTarget(type: ShotType, dir: 1 | -1, r = 0.5): number {
  const deep = dir > 0 ? COURT_R - 70 - r * 80 : COURT_L + 70 + r * 80;
  const short = NET_X + dir * (95 + r * 90);
  const mid = NET_X + dir * (230 + r * 120);
  return type === 'clear' || type === 'serve-high'
    ? deep
    : type === 'drop' || type === 'serve-short'
      ? short
      : mid;
}

/**
 * Landing band per shot, as distance from the net (px): [tight, deep]. `placeTarget` walks
 * along it with `depth` 0 → right behind the net, 1 → near the back line (court half = 424).
 */
export const BANDS: Record<ShotType, [number, number]> = {
  clear: [240, 398],
  'serve-high': [280, 396],
  drop: [62, 215],
  'serve-short': [70, 165],
  drive: [160, 345],
  smash: [140, 360],
};

/**
 * Launch lift for an aimed shot: a deep clear goes up high and falls steeply at the back, an
 * attacking clear is flat and fast (quicker, but it can be cut off and smashed).
 */
export function shotLift(type: ShotType, depth: number): number {
  const d = Math.min(1, Math.max(0, depth));
  if (type === 'clear') return LIFT.clear + 80 - 300 * d;
  if (type === 'serve-high') return LIFT['serve-high'] - 140 * d;
  // a tight drop skims the tape and falls steeply; a long drop floats a little higher
  if (type === 'drop') return LIFT.drop + 150 - 170 * d;
  return LIFT[type];
}

/** Aimed landing x: `depth` 0 = tight to the net, 0.5 = middle of the band, 1 = deep (past 1 can be out). */
export function placeTarget(type: ShotType, dir: 1 | -1, depth: number): number {
  const [near, far] = BANDS[type];
  // a little past either end is allowed, so a sprayed CPU shot can still sail long
  const d = Math.min(1.4, Math.max(-0.4, depth));
  return NET_X + dir * Math.max(30, near + (far - near) * d);
}

interface Flight {
  land: number;
  netY: number;
}
function fly(x: number, y: number, vx: number, vy: number): Flight {
  const s: Shuttle = { x, y, vx, vy, angle: 0 };
  let netY = Number.NaN;
  for (let i = 0; i < 400; i++) {
    const px = s.x;
    const py = s.y;
    stepShuttle(s, 1 / 60, false);
    if ((px - NET_X) * (s.x - NET_X) <= 0 && Number.isNaN(netY)) netY = (py + s.y) / 2;
    if (s.y >= GY) break;
  }
  return { land: s.x, netY };
}

/**
 * Aimed launch velocity: picks horizontal speed (binary search over the drag model) so the
 * shuttle lands at `targetX`, raising the arc until it clears the net tape.
 */
export function aimShot(
  x: number,
  y: number,
  type: ShotType,
  dir: 1 | -1,
  targetX: number,
  lift?: number,
): { vx: number; vy: number } {
  if (type === 'smash') {
    // a smash from the forecourt is a bullet; from the back line it has lost a third of its pace
    const back = Math.min(1, Math.max(0, (Math.abs(x - NET_X) - 120) / 300));
    const speed = 1180 - 400 * back;
    let slope = (GY - y) / Math.max(40, Math.abs(targetX - x));
    let out = { vx: dir * speed, vy: 0 };
    for (let i = 0; i < 12; i++) {
      const ang = Math.atan(slope);
      out = { vx: dir * speed * Math.cos(ang), vy: speed * Math.sin(ang) };
      const f = fly(x, y, out.vx, out.vy);
      if ((x - NET_X) * dir >= 0) return out;
      if (!Number.isNaN(f.netY) && f.netY < NET_TOP - 10 && (f.land - NET_X) * dir > 0) return out;
      slope -= 0.07;
    }
    // Too deep/low to smash over the tape: it becomes a flat drive instead.
    return aimShot(x, y, 'drive', dir, targetX);
  }
  let vy = lift ?? LIFT[type];
  let best = { vx: dir * 500, vy };
  for (let attempt = 0; attempt < 6; attempt++) {
    let lo = 60;
    let hi = 1700;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const f = fly(x, y, dir * mid, vy);
      if ((f.land - targetX) * dir < 0) lo = mid;
      else hi = mid;
    }
    best = { vx: dir * ((lo + hi) / 2), vy };
    const f = fly(x, y, best.vx, vy);
    const crosses = (x - NET_X) * dir < 0;
    if (!crosses || (!Number.isNaN(f.netY) && f.netY < NET_TOP - 12 && (f.land - NET_X) * dir > 0))
      return best;
    vy -= 90;
  }
  return best;
}

/** One physics step. Returns 'net' when it struck the net this step. */
export function stepShuttle(s: Shuttle, dt: number, net = true): 'net' | null {
  const sp = Math.hypot(s.vx, s.vy);
  const ax = -DRAG * sp * s.vx;
  const ay = GRAV - DRAG * sp * s.vy;
  s.vx += ax * dt;
  s.vy += ay * dt;
  const px = s.x;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  // orientation chases the velocity (the "flip")
  const target = Math.atan2(s.vy, s.vx);
  let d = target - s.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  s.angle += d * Math.min(1, dt * 14);
  // net: crossing the plane below the tape
  if (net && (px - NET_X) * (s.x - NET_X) <= 0 && px !== s.x && s.y > NET_TOP) {
    s.x = px;
    s.vx = -s.vx * 0.15;
    s.vy = Math.max(s.vy, 60);
    return 'net';
  }
  return null;
}

/** Where the shuttle will be when it next descends through height y (or lands). Pure prediction. */
export function predict(s: Shuttle, y: number, maxT = 4): { x: number; t: number } {
  const c: Shuttle = { ...s };
  const dt = 1 / 60;
  for (let t = 0; t < maxT; t += dt) {
    stepShuttle(c, dt);
    if ((c.vy > 0 && c.y >= y) || c.y >= GY) return { x: c.x, t };
  }
  return { x: c.x, t: maxT };
}

/**
 * Rally outcome when the shuttle touches the floor. Returns the side (0 = left player,
 * 1 = right player) that wins the point.
 */
export function pointWinner(x: number, lastHitter: 0 | 1 | null): 0 | 1 {
  const out = x < COURT_L || x > COURT_R;
  if (out && lastHitter !== null) return lastHitter === 0 ? 1 : 0;
  return x < NET_X ? 1 : 0;
}

/** Game over? First to `target`, win by 2, hard cap at target + 3 (7 → 10, 11 → 14). */
export function gameWinner(score: [number, number], target: number): 0 | 1 | null {
  const [a, b] = score;
  const cap = target + 3;
  if (a >= cap || b >= cap) return a > b ? 0 : 1;
  if (a >= target && a - b >= 2) return 0;
  if (b >= target && b - a >= 2) return 1;
  return null;
}
