/** Fact Frenzy effects: SFX burst, flying points, score counter, streak meter, confetti, pips. */
import { m } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useAnimate, useReducedMotion } from '~/lib/fx';
import { fmt } from './daily';
import { FlameShape } from './qicons';

export const RIGHT_WORDS = ['POW!', 'BAM!', 'ZAP!', 'KAPOW!', 'WHAM!', 'BOOM!', 'SMASH!', 'CRACK!'];
export const WRONG_WORDS = ['BZZT!', 'WHIFF!', 'NOPE!', 'OOF!', 'SPLAT!'];
export const TIME_WORDS = ['TIME!', 'TOCK!', 'ZZZZ!'];
/** A blind answer always says the same thing: nothing about right or wrong. */
export const LOCK_WORDS = ['LOCKED IN!'];

/**
 * The verdict as a comic starburst banner. It lives in the flow of the reveal (never floats over
 * anything), starts small and settles at exactly its own box, so it cannot cover text.
 */
export function VerdictBurst({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'right' | 'wrong' | 'time';
}) {
  const fill =
    tone === 'right' ? 'var(--qz-ok)' : tone === 'wrong' ? 'var(--qz-bad)' : 'var(--qz-warn)';
  return (
    <div data-burst className="qz-verdict relative inline-block h-[3.6rem] max-w-full">
      <span aria-hidden className="burst absolute inset-0 bg-ink" />
      <span aria-hidden className="burst absolute inset-[4px]" style={{ background: fill }} />
      <span className="relative flex h-full items-center gap-1.5 px-9 font-display text-2xl text-ink leading-none">
        {children}
      </span>
    </div>
  );
}

/** "+150" that leaves the answer and lands in the score counter. */
export function PointsFly({
  points,
  from,
  to,
  onLand,
}: {
  points: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onLand: () => void;
}) {
  return (
    <m.div
      aria-hidden
      className="pointer-events-none fixed z-[70] -mt-6 -ml-10 w-20 text-center font-display text-4xl text-pop ink-text"
      style={{ left: from.x, top: from.y }}
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{
        scale: [0.3, 1.5, 1.5, 0.7],
        opacity: [0, 1, 1, 0.9],
        x: [0, 0, 0, to.x - from.x],
        y: [0, -26, -26, to.y - from.y],
      }}
      transition={{ duration: 0.95, times: [0, 0.25, 0.5, 1], ease: 'easeInOut' }}
      onAnimationComplete={onLand}
    >
      +{points}
    </m.div>
  );
}

/** Score with a count-up (and a little pop) from the old value to the new one after `delay` ms. */
export function ScoreCounter({ value, delay }: { value: number; delay: number }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduced = useReducedMotion();
  // biome-ignore lint/correctness/useExhaustiveDependencies: delay is read once per change of value.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (reduced || value === from) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    let raf = 0;
    wrap.current?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
      { duration: 450, delay, easing: 'ease-out' },
    );
    const timer = window.setTimeout(() => {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 650);
        shown.current = Math.round(from + (value - from) * (1 - (1 - k) ** 3));
        el.textContent = fmt(shown.current);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      shown.current = value;
      el.textContent = fmt(value);
    };
  }, [value, reduced]);
  return (
    <span ref={wrap} className="inline-block origin-left">
      <span ref={ref}>{fmt(value)}</span>
    </span>
  );
}

/** Flame + five-cell bar: grows with the streak, burns from 3. Decorative; the number is text. */
export function StreakMeter({ streak }: { streak: number }) {
  const animate = useAnimate();
  const on = streak >= 3;
  const size = Math.min(1 + streak * 0.1, 1.7);
  return (
    <div className="flex items-center gap-1.5" title={`Streak ${streak}`}>
      <span
        aria-hidden
        className={`grid ${on ? 'text-pop' : 'text-muted'}`}
        style={{ transform: `scale(${size})`, transition: 'transform 0.3s var(--ease-snap)' }}
      >
        <span className={on && animate ? 'qz-flame' : ''}>
          <FlameShape className="size-7" />
        </span>
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-xl leading-none">
          <span className="sr-only">Streak </span>x{streak}
        </span>
        <span aria-hidden className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="h-1.5 w-3 rounded-sm border border-line"
              style={{ background: streak >= i ? 'var(--qz-warn)' : 'var(--card)' }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export function ComboBanner({ streak }: { streak: number }) {
  return (
    <m.div
      aria-hidden
      className="-rotate-2 relative z-[3] mx-auto w-fit border-[3px] border-line bg-c1 px-4 py-1 text-center font-display text-2xl text-on-c1 shadow-ink-sm"
      initial={{ x: -120, opacity: 0, skewX: -12 }}
      animate={{ x: 0, opacity: 1, skewX: -12 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
    >
      COMBO x{streak}! <span className="text-lg">+25 a hit</span>
    </m.div>
  );
}

/** Three pips: how hard the question is. Shape (filled vs ring) says it, not just colour. */
export function DifficultyPips({ level }: { level: 1 | 2 | 3 }) {
  const word = level === 1 ? 'Easy' : level === 2 ? 'Medium' : 'Hard';
  return (
    <span className="inline-flex items-center gap-1.5" title={`Difficulty: ${word}`}>
      <span aria-hidden className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="size-3 rotate-45 border-2 border-line"
            style={{ background: i <= level ? 'var(--on-c1)' : 'transparent' }}
          />
        ))}
      </span>
      <span className="sr-only">Difficulty {word}</span>
    </span>
  );
}

/** One-shot canvas confetti in the theme colours. Not rendered under reduced motion. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const cv = ref.current;
    if (!cv || reduced) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = window.innerWidth * dpr;
    cv.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colours = ['--c1', '--c2', '--c3', '--qz-ok', '--qz-warn'].map((v) =>
      css.getPropertyValue(v).trim(),
    );
    const W = window.innerWidth;
    const bits = Array.from({ length: 110 }, (_, i) => ({
      x: W / 2 + (Math.random() - 0.5) * 80,
      y: window.innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 4,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.4,
      c: colours[i % colours.length] || '#ffd400',
    }));
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, window.innerHeight);
      for (const b of bits) {
        b.vy += 0.38;
        b.vx *= 0.985;
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1800) / 700);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (t < 2500) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, window.innerHeight);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  if (reduced) return null;
  return <canvas ref={ref} aria-hidden className="qz-confetti" />;
}
