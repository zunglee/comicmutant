/**
 * JS-side motion tokens (ruling S20): every Motion transition in a component comes from here, so a
 * skin's `motion` (spring, stagger, entrance, durations, calm) drives the animation, not a number
 * typed into the component.
 *
 * Call sites keep the value they were tuned with on the comic look (`spring({stiffness: 500,
 * damping: 14})`, `delay(i, 0.03)`); the hook scales it by the active skin's ratio to the comic
 * baseline, so comic stays pixel-identical and a softer skin is softer everywhere. A calm skin never
 * springs: it gets a tween of at least its fast duration (>= 0.4 s, T7), and no bouncy entrances.
 */
import { useMemo } from 'react';
import { comic } from './comic';
import { useSkinMaybe } from './context';
import type { SkinSpec } from './types';

/** The comic values the call sites were written against: comic's ratio is always exactly 1. */
const BASE = {
  stiffness: comic.motion.spring.stiffness,
  damping: comic.motion.spring.damping,
  stagger: comic.motion.stagger,
};

type Ease = [number, number, number, number];
type Spring = { stiffness: number; damping: number };

/** '0.6s' | '600ms' → 0.6 */
export const seconds = (d: string) =>
  d.trim().endsWith('ms') ? Number.parseFloat(d) / 1000 : Number.parseFloat(d);

/** 'cubic-bezier(0.16, 1, 0.3, 1)' → [0.16, 1, 0.3, 1]; anything else → the comic ease-out. */
export function bezier(css: string): Ease {
  const n = /cubic-bezier\(([^)]*)\)/.exec(css)?.[1]?.split(',').map(Number);
  return n && n.length === 4 && n.every((x) => !Number.isNaN(x)) ? (n as Ease) : [0.16, 1, 0.3, 1];
}

/**
 * Entrance variants. Position and scale only, never opacity: the server renders `initial`, and text
 * above the fold must be readable in the SSR HTML and without JavaScript (MASTER motion rule).
 * `fade` is the calm settle: a short drift, no pop.
 */
const ENTRANCES = {
  pop: { initial: { scale: 0.92, y: 10 }, animate: { scale: 1, y: 0 } },
  rise: { initial: { y: 18 }, animate: { y: 0 } },
  fade: { initial: { y: 8 }, animate: { y: 0 } },
  slide: { initial: { x: -24 }, animate: { x: 0 } },
} as const;

export interface SkinMotionTokens {
  calm: boolean;
  /** Durations in seconds. */
  durations: { fast: number; base: number; slow: number };
  ease: Ease;
  easeSnap: Ease;
  /** The skin's own spring and stagger (spec.motion). */
  springConfig: Spring;
  stagger: number;
  /** Entrance variants for cards and panels ({initial, animate}), from spec.motion.entrance. */
  entrance: (typeof ENTRANCES)[keyof typeof ENTRANCES];
  /** A duration in seconds, floored at the calm minimum. */
  dur: (s: number) => number;
  /** Stagger delay for item `i`, scaled from the comic step `step` (default: the skin's stagger). */
  delay: (i: number, step?: number) => number;
  /** Spring physics scaled from comic-tuned values (for useSpring and other non-transition uses). */
  scaleSpring: (base: Spring) => Spring;
  /** A spring transition scaled from a comic-tuned one; a calm skin gets a slow tween instead. */
  spring: (base?: Spring, delay?: number) => Record<string, unknown>;
  /**
   * A tween: the call site's duration and ease on loud skins (comic unchanged), the skin's ease
   * floored at the calm minimum on calm ones.
   */
  tween: (s: number, opts?: { delay?: number; ease?: Ease | string }) => Record<string, unknown>;
}

export function skinMotion(spec: SkinSpec): SkinMotionTokens {
  const m = spec.motion;
  const durations = {
    fast: seconds(m.durFast),
    base: seconds(m.durBase),
    slow: seconds(m.durSlow),
  };
  const calm = m.calm;
  const min = calm ? Math.max(0.4, durations.fast) : 0;
  const ease = bezier(m.easeOut);
  const dur = (s: number) => Math.max(s, min);
  const scale = m.stagger / BASE.stagger;
  const scaleSpring = (base: Spring): Spring => ({
    stiffness: (base.stiffness * m.spring.stiffness) / BASE.stiffness,
    damping: (base.damping * m.spring.damping) / BASE.damping,
  });
  return {
    calm,
    durations,
    ease,
    easeSnap: bezier(m.easeSnap),
    springConfig: m.spring,
    stagger: m.stagger,
    entrance: calm ? ENTRANCES.fade : ENTRANCES[m.entrance],
    dur,
    delay: (i, step = BASE.stagger) => i * step * scale,
    scaleSpring,
    spring: (base = { stiffness: BASE.stiffness, damping: BASE.damping }, delay = 0) =>
      calm
        ? { duration: dur(durations.base), ease, delay }
        : { type: 'spring', ...scaleSpring(base), delay },
    tween: (s, opts = {}) =>
      calm
        ? { duration: dur(s), ease, delay: opts.delay ?? 0 }
        : {
            duration: s,
            ...(opts.delay !== undefined ? { delay: opts.delay } : {}),
            ...(opts.ease !== undefined ? { ease: opts.ease } : {}),
          },
  };
}

/** The active skin's motion tokens (comic's outside a SkinProvider). */
export function useSkinMotion(): SkinMotionTokens {
  const spec = useSkinMaybe()?.spec ?? comic;
  return useMemo(() => skinMotion(spec), [spec]);
}
