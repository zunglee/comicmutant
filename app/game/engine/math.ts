/** Small, allocation-free maths helpers shared by the rig, the engine and every game. */

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a || 1), 0, 1);
export const fract = (v: number) => v - Math.floor(v);
/** Deterministic 0..1 hash of a number — FX that must be pure for a given t use this, not Math.random. */
export const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
export const sign = (v: number) => (v < 0 ? -1 : 1);
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
} satisfies Record<string, Ease>;

/** Seeded PRNG (mulberry32) so CPU AI and tests are reproducible. */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}
