/**
 * Shared bits for the learn widgets: the two skins (both read the skin's CSS variables: the sacred half
 * is app/skins/sacred.ts, nothing is written twice), petal / comic bursts, the diya, guarded localStorage.
 * Animation rules: transform + opacity only; Sacred never shorter than 600 ms, no shakes or flashes;
 * everything stills under prefers-reduced-motion or the lite effects switch.
 */
import { m } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from '~/lib/fx';
import { useSkinMotion } from '~/skins/motion';
import type { Realm } from '../contract';

export const LEARN_CSS = `@layer components{
.lw{--lw-ease:var(--ease-out);font-family:var(--font-body)}
.lw[data-lw=sacred]{--lw-bg:var(--card);--lw-fg:var(--card-fg);--lw-muted:var(--muted);
--lw-accent:var(--c1-text-card);--lw-on-accent:var(--card);--lw-soft:color-mix(in srgb,var(--c1) 18%,var(--lw-bg));
--lw-line:var(--line);--lw-ring:var(--c3-text);--lw-bw:var(--border-w);--lw-r:var(--radius-m);
--lw-shadow:var(--shadow-x) var(--shadow-y) var(--shadow-blur) var(--shadow-spread) var(--shadow-color);
--lw-good:color-mix(in srgb,var(--qz-ok) 35%,var(--lw-fg));--lw-good-bg:color-mix(in srgb,var(--qz-ok) 18%,var(--lw-bg));--lw-warm:color-mix(in srgb,var(--lw-accent) 18%,var(--lw-bg));
--lw-display:var(--font-display)}
.lw[data-lw=sacred] .lw-title{font-weight:var(--display-weight)}
.lw button,.lw input{font:inherit}
.lw[data-lw=comic]{--lw-bg:var(--card);--lw-fg:var(--card-fg);--lw-muted:var(--muted);
--lw-accent:var(--c3);--lw-on-accent:var(--on-c3);--lw-soft:color-mix(in srgb,var(--lw-fg) 12%,var(--lw-bg));
--lw-line:var(--line);--lw-ring:var(--c3);--lw-bw:var(--border-w);--lw-r:calc(var(--radius-m) + 4px);--lw-shadow:var(--shadow-ink);
--lw-good:var(--qz-ok);--lw-good-bg:color-mix(in srgb,var(--qz-ok) 18%,var(--lw-bg));--lw-warm:color-mix(in srgb,var(--lw-accent) 18%,var(--lw-bg));
--lw-display:var(--font-display)}
.lw[data-lw=comic] .lw-btn{font-family:var(--font-head)}
.lw-card{background:var(--lw-bg);color:var(--lw-fg);border:var(--lw-bw) solid var(--lw-line);border-radius:var(--lw-r);box-shadow:var(--lw-shadow)}
.lw-title{font-family:var(--lw-display);line-height:1.1}
.lw[data-lw=comic] .lw-title{letter-spacing:var(--display-tracking)}
.lw-muted{color:var(--lw-muted)}
.lw-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:44px;min-width:44px;padding:.5rem 1rem;
background:var(--lw-soft);color:var(--lw-fg);border:var(--lw-bw) solid var(--lw-line);border-radius:var(--lw-r);font-weight:600;
cursor:pointer;text-align:center;transition:transform .2s var(--lw-ease),opacity .2s}
.lw[data-lw=sacred] .lw-btn{transition-duration:var(--dur-fast)}
.lw-btn[data-primary]{background:var(--lw-accent);color:var(--lw-on-accent)}
.lw-btn:hover:not(:disabled):not([aria-disabled=true]){transform:translateY(-2px)}
.lw-btn:disabled,.lw-btn[aria-disabled=true]{opacity:.55;cursor:default}
.lw-btn[aria-pressed=true],.lw-btn[data-on]{outline:3px solid var(--lw-accent);outline-offset:-3px}
.lw a:focus-visible,.lw button:focus-visible,.lw [tabindex]:focus-visible{outline:3px solid var(--lw-ring);outline-offset:3px}
.lw-chip{display:inline-block;padding:.1rem .6rem;border-radius:999px;background:var(--lw-soft);font-size:.8rem;font-weight:600;color:var(--lw-muted)}
.lw-link{color:var(--lw-fg);text-decoration:underline;text-underline-offset:3px}
.lw-flame{transform-origin:50% 100%;animation:lw-flick 3.2s ease-in-out infinite}
.lw[data-lw=comic] .lw-flame{animation-duration:.7s}
.lw-float{animation:lw-float 7s ease-in-out infinite}
.lw-turn{animation:lw-turn 90s linear infinite}
.lw-turn-back{animation:lw-turn 90s linear infinite reverse}
.lw-wheel:hover .lw-turn,.lw-wheel:hover .lw-turn-back,.lw-wheel:focus-within .lw-turn,.lw-wheel:focus-within .lw-turn-back,.lw-wheel[data-paused] .lw-turn,.lw-wheel[data-paused] .lw-turn-back{animation-play-state:paused}
@keyframes lw-flick{0%,100%{transform:scale(1,1)}50%{transform:scale(.92,1.08)}}
@keyframes lw-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes lw-turn{to{transform:rotate(360deg)}}
html[data-fx=lite] .lw *{animation:none!important}
@media (prefers-reduced-motion:reduce){.lw,.lw *,.lw *::before,.lw *::after{animation:none!important;transition:none!important}}
}`;

export function LearnStyles() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS string above, no user input.
  return <style dangerouslySetInnerHTML={{ __html: LEARN_CSS }} />;
}

/** Layout effect in the browser (focus moves in the same frame the control unmounts), plain on the server. */
export const useFocusEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * A ref to focus whenever `dep` changes (not on first render). Controls that unmount (Next, a placed
 * chip, Play again) would drop focus to <body>; the next sensible element takes it instead.
 */
export function useRefocus<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useFocusEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus({ preventScroll: true });
  }, [dep]);
  return ref;
}

/**
 * Seconds for a transition, from the active SKIN (S19/S20), not the realm: a calm skin is never quicker
 * than 600 ms and eases out softly; a loud one keeps the snap ease. Reduced motion is instant. `realm`
 * stays in the signature for the wording/content callers still branch on.
 */
export function useDur(_realm?: Realm) {
  const reduced = useReducedMotion();
  const mo = useSkinMotion();
  return {
    reduced,
    calm: mo.calm,
    dur: (s: number) => (reduced ? 0 : mo.calm ? Math.max(0.6, s) : s),
    ease: mo.calm ? mo.ease : mo.easeSnap,
  };
}

export const rootProps = (realm: Realm) =>
  ({ 'data-lw': realm, className: 'lw' }) as { 'data-lw': Realm; className: string };

/** Deterministic hash → [0,1) so SSR and client agree and nothing needs Math.random. */
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota: progress is a nicety, never an error */
  }
}

/** A localStorage-backed value that starts at `initial` (SSR-safe) and loads after mount. */
export function useStored<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(initial);
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per key.
  useEffect(() => {
    setVal(readJson(key, initial));
  }, [key]);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setVal((p) => {
        const n = typeof v === 'function' ? (v as (p: T) => T)(p) : v;
        writeJson(key, n);
        return n;
      });
    },
    [key],
  );
  return [val, set];
}

/** Petals are the skin's lotus pink and saffron, lightened over the card colour. */
const PETALS = [
  'color-mix(in srgb, var(--c2) 45%, var(--card))',
  'color-mix(in srgb, var(--c1) 55%, var(--card))',
  'color-mix(in srgb, var(--c2) 70%, var(--card))',
  'color-mix(in srgb, var(--c1) 25%, var(--card))',
  'color-mix(in srgb, var(--c2) 55%, var(--card))',
];
const SHARDS = ['#ffd400', '#ff2e4d', '#ffffff', '#35d0ff'];

/** One-shot celebration: drifting petals (sacred) or a comic burst. Renders nothing when still. */
export function Celebrate({ realm, run }: { realm: Realm; run: number }) {
  const { reduced, calm } = useDur(realm);
  if (!run || reduced) return null;
  // Petals in a calm skin; the comic burst (shards) is too loud for one (T7).
  const n = calm ? 18 : 16;
  return (
    <span
      key={run}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-celebrate={realm}
    >
      {Array.from({ length: n }, (_, i) => {
        const a = hash01('c', i);
        const b = hash01('d', i);
        if (calm) {
          return (
            <m.span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size decorative list.
              key={i}
              className="absolute block h-3.5 w-2.5"
              style={{
                left: `${6 + a * 88}%`,
                top: 0,
                background: PETALS[i % PETALS.length],
                borderRadius: '100% 0 100% 0',
              }}
              initial={{ opacity: 0, y: -20, rotate: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [-20, 160, 320],
                x: [0, (b - 0.5) * 80, (a - 0.5) * 120],
                rotate: (b - 0.5) * 540,
              }}
              transition={{ duration: 3.2 + a * 1.6, delay: b * 0.8, ease: 'easeInOut' }}
            />
          );
        }
        const ang = (i / n) * Math.PI * 2;
        const d = 90 + a * 90;
        return (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size decorative list.
            key={i}
            className="absolute top-1/2 left-1/2 block h-3 w-3 border-2 border-black"
            style={{ background: SHARDS[i % SHARDS.length] }}
            initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
            animate={{
              opacity: [1, 1, 0],
              x: Math.cos(ang) * d,
              y: Math.sin(ang) * d,
              scale: [0.4, 1.4, 0.8],
              rotate: 200,
            }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
}

/** A soft ring that grows and fades behind a tapped control (calm in Sacred, snappier in comic). */
export function Pulse({ realm, run }: { realm: Realm; run: number }) {
  const { reduced, dur, calm } = useDur(realm);
  if (!run || reduced) return null;
  return (
    <m.span
      key={run}
      aria-hidden
      className="pointer-events-none absolute inset-0 m-auto block h-16 w-16 round"
      style={{ border: '3px solid var(--lw-accent)' }}
      initial={{ opacity: 0.7, scale: 0.4 }}
      animate={{ opacity: 0, scale: calm ? 2.4 : 2 }}
      transition={{ duration: dur(0.9), ease: 'easeOut' }}
    />
  );
}

/** A generic lamp (never a depiction): bowl plus a flame that lights up. */
export function Diya({ lit, size = 34 }: { lit: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={{ display: 'block' }}
    >
      <path
        d="M4 22 Q20 40 36 22 Z"
        fill={lit ? 'var(--lw-accent)' : 'var(--lw-soft)'}
        stroke="var(--lw-line)"
        strokeWidth="2"
      />
      <g
        className={lit ? 'lw-flame' : undefined}
        style={{ opacity: lit ? 1 : 0, transition: 'opacity .8s' }}
      >
        <path
          d="M20 4 Q28 14 20 21 Q12 14 20 4 Z"
          fill="#f7b32b"
          stroke="#c2410c"
          strokeWidth="1.5"
        />
      </g>
      {!lit && <path d="M20 14 L20 21" stroke="var(--lw-line)" strokeWidth="2" />}
    </svg>
  );
}

/** Fisher-Yates on a copy; `rnd` injectable for tests. */
export function shuffled<T>(xs: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export type IconName =
  | 'spark'
  | 'thumb'
  | 'shuffle'
  | 'flower'
  | 'lamp'
  | 'ring'
  | 'grid'
  | 'sprout'
  | 'question'
  | 'check';

/** Line icons (MASTER rule: SVG, never emoji). Decorative: always aria-hidden. */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      {name === 'spark' && (
        <path
          {...p}
          d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"
        />
      )}
      {name === 'thumb' && (
        <path
          {...p}
          d="M7 11v9H4v-9zM10 20h7a2 2 0 0 0 2-1.6l1-5A2 2 0 0 0 18 11h-4V6a2 2 0 0 0-2-2l-2 7z"
        />
      )}
      {name === 'shuffle' && (
        <path {...p} d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" />
      )}
      {name === 'flower' && (
        <g {...p}>
          {[0, 72, 144, 216, 288].map((r) => (
            <circle key={r} cx="12" cy="6.5" r="3" transform={`rotate(${r} 12 12)`} />
          ))}
          <circle cx="12" cy="12" r="2" />
        </g>
      )}
      {name === 'lamp' && <path {...p} d="M3 13q9 9 18 0zM12 3q4.5 5 0 9q-4.5-4 0-9z" />}
      {name === 'ring' && (
        <g {...p}>
          <circle cx="12" cy="12" r="9" strokeDasharray="2 3.2" />
          <circle cx="12" cy="12" r="2.2" />
        </g>
      )}
      {name === 'grid' && (
        <g {...p}>
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </g>
      )}
      {name === 'sprout' && (
        <path {...p} d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z" />
      )}
      {name === 'question' && (
        <g {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17.2v.01" />
        </g>
      )}
      {name === 'check' && <path {...p} d="M5 12l5 5 9-10" />}
    </svg>
  );
}
