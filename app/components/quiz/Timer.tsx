/**
 * The question clock: a draining ring (Web Animations, so it keeps its own time and does no React
 * work per frame) with the whole seconds in the middle. Green → yellow → red, a gentle pulse in the
 * last five seconds. Reduced motion: the ring steps once a second instead of sliding.
 * Remount it per question (`key`); `active` false freezes it the moment the player locks in.
 */
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '~/lib/fx';

const R = 22;
const C = 2 * Math.PI * R;

export function Timer({
  seconds,
  active,
  onExpire,
  onSay,
}: {
  seconds: number;
  active: boolean;
  onExpire: () => void;
  /** Screen-reader milestones ("10 seconds left"). */
  onSay: (text: string) => void;
}) {
  const reduced = useReducedMotion();
  const ring = useRef<SVGCircleElement>(null);
  const anim = useRef<Animation | null>(null);
  const endAt = useRef(0);
  const said = useRef(new Set<number>());
  const [left, setLeft] = useState(seconds);
  const cb = useRef({ onExpire, onSay });
  cb.current = { onExpire, onSay };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reduced` only picks the easing; a media-query flip must not restart the clock.
  useEffect(() => {
    if (!active) {
      anim.current?.pause();
      return;
    }
    if (!endAt.current) endAt.current = performance.now() + seconds * 1000;
    const el = ring.current;
    if (el && !anim.current && typeof el.animate === 'function') {
      anim.current = el.animate(
        [
          { strokeDashoffset: 0, stroke: '#8de969', offset: 0 },
          { stroke: '#ffd400', offset: 0.5 },
          { stroke: '#ff5a6b', offset: 0.7 },
          { strokeDashoffset: C, stroke: '#ff5a6b', offset: 1 },
        ],
        {
          duration: seconds * 1000,
          easing: reduced ? `steps(${seconds}, end)` : 'linear',
          fill: 'forwards',
        },
      );
    }
    let fired = false;
    const tick = () => {
      const rem = Math.max(0, endAt.current - performance.now());
      const whole = Math.ceil(rem / 1000);
      setLeft(whole);
      for (const m of [10, 5, 3]) {
        if (whole <= m && whole > 0 && !said.current.has(m) && seconds > m) {
          said.current.add(m);
          cb.current.onSay(`${m} seconds left`);
        }
      }
      if (rem <= 0 && !fired) {
        fired = true;
        cb.current.onExpire();
      }
    };
    const id = window.setInterval(tick, 200);
    // A hidden tab throttles timers: check the real clock the moment the player is back.
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [active, seconds]);

  const urgent = active && left <= 5 && left > 0;
  return (
    <div
      className={`relative grid size-14 shrink-0 place-items-center ${urgent ? 'qz-pulse' : ''}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 52 52"
        className="absolute inset-0 -rotate-90"
        focusable="false"
        aria-hidden
      >
        <circle cx="26" cy="26" r={R} fill="var(--card)" stroke="var(--line)" strokeWidth={9} />
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke="var(--muted)"
          strokeOpacity={0.35}
          strokeWidth={5}
        />
        <circle
          ref={ring}
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke="#8de969"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={0}
        />
      </svg>
      <span
        className="relative font-display text-2xl leading-none"
        style={{ color: 'var(--card-fg)' }}
      >
        {left}
      </span>
    </div>
  );
}
