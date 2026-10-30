/**
 * The weather behind every page (byte-man's idea, per comic motif): webs drift, embers rise, snow
 * falls, lightning cracks, bats cross a moon… recoloured by the equipped theme. A character page can
 * push its own character's weather with `useAtmosphere()`.
 *
 * Cheap by design: one canvas at device-pixel-ratio 1, ≤ 30 fps, ≤ 40 particles, starts after load +
 * idle, pauses when the tab is hidden. Off in Lite FX and under prefers-reduced-motion.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAnimate } from '~/lib/fx';
import type { Motif } from '~/lib/taxonomy';
import { useTheme } from '~/lib/theme/context';

export interface Weather {
  motif: Motif;
  c1: string;
  c3: string;
  dark: boolean;
}

// ── page override store ───────────────────────────────────────────────────────────────

let override: Weather | null = null;
const subs = new Set<() => void>();
const emit = () => {
  for (const s of subs) s();
};

/** A page (e.g. /c/:slug) wears its character's weather while mounted. */
export function useAtmosphere(w: Weather | null) {
  const key = w ? `${w.motif}|${w.c1}|${w.c3}|${w.dark}` : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value.
  useEffect(() => {
    if (!w) return;
    override = w;
    emit();
    return () => {
      if (override === w) override = null;
      emit();
    };
  }, [key]);
}

function useOverride() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => override,
    () => null,
  );
}

// ── particles ─────────────────────────────────────────────────────────────────────────

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  a: number;
  r: number;
  life: number;
  seed: number;
}

type Spawn = (w: number, h: number, initial: boolean) => P;
type Draw = (ctx: CanvasRenderingContext2D, p: P, t: number, c: Weather) => void;

const R = Math.random;
const TAU = Math.PI * 2;

function part(w: number, h: number, o: Partial<P>): P {
  return {
    x: R() * w,
    y: R() * h,
    vx: 0,
    vy: 0,
    s: 1,
    a: 0.5,
    r: R() * TAU,
    life: 1,
    seed: R(),
    ...o,
  };
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n = 4) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r * 0.35 : r;
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Per motif: how many, how they spawn, how they look. Occasional "events" live in EVENTS. */
const KINDS: Record<Motif, { n: number; spawn: Spawn; draw: Draw }> = {
  flame: {
    n: 34,
    spawn: (w, h, init) =>
      part(w, h, {
        y: init ? R() * h : h + 10,
        vy: -(0.4 + R() * 0.9),
        vx: (R() - 0.5) * 0.3,
        s: 1 + R() * 2.5,
      }),
    draw: (ctx, p, t, c) => {
      p.x += Math.sin(t * 2 + p.seed * 9) * 0.3;
      ctx.fillStyle = p.seed > 0.5 ? c.c1 : c.c3;
      ctx.globalAlpha = 0.55 * Math.min(1, p.y / 300);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * (0.8 + Math.sin(t * 9 + p.seed * 20) * 0.3), 0, TAU);
      ctx.fill();
    },
  },
  ice: {
    n: 36,
    spawn: (w, h, init) =>
      part(w, h, {
        y: init ? R() * h : -10,
        vy: 0.3 + R() * 0.6,
        vx: (R() - 0.5) * 0.3,
        s: 2 + R() * 3,
      }),
    draw: (ctx, p, t, c) => {
      p.x += Math.sin(t + p.seed * 7) * 0.25;
      ctx.strokeStyle = c.dark ? '#ffffff' : c.c1;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = p.r + t * 0.3 + (i * Math.PI) / 3;
        ctx.moveTo(p.x - Math.cos(a) * p.s, p.y - Math.sin(a) * p.s);
        ctx.lineTo(p.x + Math.cos(a) * p.s, p.y + Math.sin(a) * p.s);
      }
      ctx.stroke();
    },
  },
  cosmic: {
    n: 40,
    spawn: (w, h) => part(w, h, { s: 0.6 + R() * 1.8 }),
    draw: (ctx, p, t, c) => {
      ctx.fillStyle = p.seed > 0.7 ? c.c3 : c.dark ? '#ffffff' : c.c1;
      ctx.globalAlpha = 0.25 + Math.max(0, Math.sin(t * (1 + p.seed * 2) + p.seed * 30)) * 0.55;
      star(ctx, p.x, p.y, p.s * 2.2);
      ctx.fill();
    },
  },
  magic: {
    n: 9,
    spawn: (w, h, init) =>
      part(w, h, { y: init ? R() * h : h + 60, vy: -(0.15 + R() * 0.25), s: 14 + R() * 26 }),
    draw: (ctx, p, t, c) => {
      ctx.strokeStyle = p.seed > 0.5 ? c.c3 : c.c1;
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, TAU);
      ctx.stroke();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(t * 0.4 * (p.seed > 0.5 ? 1 : -1));
      star(ctx, 0, 0, p.s * 0.75, 3);
      ctx.stroke();
      ctx.restore();
    },
  },
  shadow: {
    n: 14,
    spawn: (w, h, init) =>
      part(w, h, {
        x: init ? R() * w : -60,
        vx: 0.15 + R() * 0.3,
        s: 30 + R() * 60,
        y: h * (0.5 + R() * 0.5),
      }),
    draw: (ctx, p, _t, c) => {
      ctx.fillStyle = c.dark ? '#000000' : c.c1;
      ctx.globalAlpha = c.dark ? 0.35 : 0.08;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, TAU);
      ctx.fill();
    },
  },
  speed: {
    n: 22,
    spawn: (w, h, init) =>
      part(w, h, { x: init ? R() * w : w + 40, vx: -(6 + R() * 10), s: 30 + R() * 90 }),
    draw: (ctx, p, _t, c) => {
      ctx.strokeStyle = p.seed > 0.5 ? c.c3 : c.c1;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1 + p.seed * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.s, p.y);
      ctx.stroke();
    },
  },
  strength: {
    n: 26,
    spawn: (w, h, init) =>
      part(w, h, { y: init ? R() * h : -10, vy: 0.6 + R() * 1.4, s: 1.5 + R() * 3.5 }),
    draw: (ctx, p, _t, c) => {
      ctx.fillStyle = c.dark ? c.c3 : c.c1;
      ctx.globalAlpha = 0.4;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r + p.y * 0.01);
      ctx.fillRect(-p.s, -p.s, p.s * 2, p.s * 1.4);
      ctx.restore();
    },
  },
  nature: {
    n: 20,
    spawn: (w, h, init) =>
      part(w, h, { y: init ? R() * h : -20, vy: 0.4 + R() * 0.5, s: 5 + R() * 6 }),
    draw: (ctx, p, t, c) => {
      p.x += Math.sin(t * 1.5 + p.seed * 8) * 0.7;
      ctx.fillStyle = p.seed > 0.5 ? c.c1 : c.c3;
      ctx.globalAlpha = 0.45;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(t * 2 + p.seed * 5) * 0.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  },
  web: {
    n: 10,
    spawn: (w, h, init) =>
      part(w, h, { y: init ? R() * h : -40, vy: 0.15 + R() * 0.2, s: 60 + R() * 140 }),
    draw: (ctx, p, t, c) => {
      // A gossamer strand swaying as it drifts down.
      ctx.strokeStyle = c.dark ? '#ffffff' : c.c1;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      const sway = Math.sin(t * 0.8 + p.seed * 6) * 20;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + sway, p.y + p.s / 2, p.x + sway * 0.4, p.y + p.s);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x + sway * 0.4, p.y + p.s, 2, 0, TAU);
      ctx.fillStyle = c.c1;
      ctx.fill();
    },
  },
  claw: {
    n: 5,
    spawn: (w, h) => part(w, h, { life: R(), s: 40 + R() * 60 }),
    draw: (ctx, p, _t, c) => {
      // A slash appears, holds, fades; then respawns elsewhere.
      p.life += 0.008;
      if (p.life > 1)
        Object.assign(p, part(ctx.canvas.width, ctx.canvas.height, { life: 0, s: 40 + R() * 60 }));
      const a = p.life < 0.15 ? p.life / 0.15 : Math.max(0, 1 - (p.life - 0.15) / 0.5);
      ctx.strokeStyle = c.c3;
      ctx.globalAlpha = 0.4 * a;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x + i * 12, p.y);
        ctx.lineTo(p.x + i * 12 + p.s * 0.6, p.y + p.s);
        ctx.stroke();
      }
    },
  },
  mind: {
    n: 6,
    spawn: (w, h) => part(w, h, { life: R(), s: 80 + R() * 120 }),
    draw: (ctx, p, _t, c) => {
      p.life += 0.004;
      if (p.life > 1)
        Object.assign(p, part(ctx.canvas.width, ctx.canvas.height, { life: 0, s: 80 + R() * 120 }));
      ctx.strokeStyle = p.seed > 0.5 ? c.c1 : c.c3;
      ctx.globalAlpha = 0.35 * (1 - p.life);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * p.life * (1 - i * 0.25), 0, TAU);
        ctx.stroke();
      }
    },
  },
  water: {
    n: 30,
    spawn: (w, h, init) =>
      part(w, h, { y: init ? R() * h : h + 10, vy: -(0.4 + R() * 0.8), s: 2 + R() * 5 }),
    draw: (ctx, p, t, c) => {
      p.x += Math.sin(t * 2 + p.seed * 9) * 0.4;
      ctx.strokeStyle = c.dark ? '#ffffff' : c.c1;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, TAU);
      ctx.stroke();
    },
  },
  chaos: {
    n: 30,
    spawn: (w, h, init) =>
      part(w, h, { y: init ? R() * h : -10, vy: 0.6 + R() * 1, s: 4 + R() * 4 }),
    draw: (ctx, p, t, c) => {
      ctx.fillStyle = [c.c1, c.c3][Math.floor(p.seed * 2)] ?? c.c1;
      ctx.globalAlpha = 0.45;
      ctx.save();
      ctx.translate(p.x + Math.sin(t * 3 + p.seed * 9) * 6, p.y);
      ctx.rotate(t * (p.seed - 0.5) * 4);
      ctx.beginPath();
      ctx.moveTo(0, -p.s);
      ctx.lineTo(p.s * 0.6, 0);
      ctx.lineTo(0, p.s);
      ctx.lineTo(-p.s * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  },
  size: {
    n: 14,
    spawn: (w, h) => part(w, h, { s: 6 + R() * 30, vy: -(0.1 + R() * 0.2) }),
    draw: (ctx, p, t, c) => {
      const k = (Math.sin(t * (0.5 + p.seed) + p.seed * 10) + 1) / 2;
      ctx.strokeStyle = p.seed > 0.5 ? c.c1 : c.c3;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      const s = p.s * (0.3 + k);
      ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
    },
  },
  tech: {
    n: 18,
    spawn: (w, h, init) =>
      part(w, h, {
        x: Math.round((R() * w) / 40) * 40,
        y: init ? R() * h : -20,
        vy: 1 + R() * 2,
        s: 20 + R() * 60,
      }),
    draw: (ctx, p, _t, c) => {
      // Data pulses running down circuit traces.
      ctx.strokeStyle = c.c3;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.s);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = c.c3;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    },
  },
  bolt: {
    n: 30,
    spawn: (w, h, init) =>
      part(w, h, {
        y: init ? R() * h : h + 10,
        vy: -(0.3 + R() * 0.6),
        vx: (R() - 0.5) * 0.8,
        s: 2 + R() * 3,
      }),
    draw: (ctx, p, t, c) => {
      ctx.fillStyle = c.c3;
      ctx.globalAlpha = 0.25 + Math.max(0, Math.sin(t * 8 + p.seed * 40)) * 0.65;
      star(ctx, p.x, p.y, p.s * 2.5);
      ctx.fill();
    },
  },
};

/** Occasional set pieces, every few seconds. */
const EVENTS: Partial<
  Record<
    Motif,
    (ctx: CanvasRenderingContext2D, w: number, h: number, k: number, c: Weather) => void
  >
> = {
  bolt: (ctx, w, h, k, c) => {
    // Lightning: a forked bolt + sky flash in the first 0.25 of the event.
    if (k > 0.25) return;
    const a = 1 - k / 0.25;
    ctx.globalAlpha = 0.12 * a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.7 * a;
    ctx.strokeStyle = c.c3;
    ctx.lineWidth = 3;
    let x = w * 0.7;
    let y = 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < h * 0.6) {
      x += (Math.sin(y * 0.07) + Math.cos(y * 0.031)) * 18;
      y += 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
  shadow: (ctx, w, h, k, c) => {
    // A small flight of bats crosses the top of the screen.
    ctx.fillStyle = c.dark ? '#000000' : c.c1;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 5; i++) {
      const x = -60 + k * (w + 120) - i * 40;
      const y = h * 0.18 + Math.sin(k * 20 + i) * 14 + i * 12;
      const f = Math.sin(k * 60 + i) * 6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - 8, y - 6 - f, x - 16, y - 2);
      ctx.quadraticCurveTo(x - 10, y + 1, x - 4, y + 4);
      ctx.quadraticCurveTo(x, y + 2, x + 4, y + 4);
      ctx.quadraticCurveTo(x + 10, y + 1, x + 16, y - 2);
      ctx.quadraticCurveTo(x + 8, y - 6 - f, x, y);
      ctx.fill();
    }
  },
  cosmic: (ctx, w, h, k, c) => {
    // Shooting star.
    if (k > 0.3) return;
    const q = k / 0.3;
    const x = w * (0.1 + q * 0.6);
    const y = h * (0.1 + q * 0.25);
    ctx.globalAlpha = 0.7 * (1 - q);
    ctx.strokeStyle = c.c3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 90, y - 38);
    ctx.stroke();
  },
};
const EVENT_EVERY = 5;

// ── component ─────────────────────────────────────────────────────────────────────────

/**
 * Global (no `weather`): follows the equipped theme and stands down while a page override is set.
 * Local (`weather` given): rendered inside a page that paints its own background, in that page's
 * stacking context (the page wrapper must be `isolate`, its content `relative z-[1]`).
 */
const ATMO_MASK =
  'linear-gradient(90deg, #000 0, #000 8%, rgb(0 0 0 / 0.25) 22%, rgb(0 0 0 / 0.25) 78%, #000 92%, #000 100%)';

export function Atmosphere({
  hidden = false,
  weather: local,
}: {
  hidden?: boolean;
  weather?: Weather;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const animate = useAnimate();
  const { current } = useTheme();
  const page = useOverride();
  const weather: Weather = local ?? {
    motif: current.motif,
    c1: current.vars['--c1'] ?? '#ff2e4d',
    c3: current.vars['--c3'] ?? '#ffd400',
    dark: current.mood === 'dark',
  };
  const live = useRef(weather);
  live.current = weather;
  const on = animate && !hidden && (local ? true : !page);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !on) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = 0;
    let started = false;
    let motif: Motif | null = null;
    let parts: P[] = [];
    const t0 = performance.now();
    const size = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    size();
    window.addEventListener('resize', size);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / 30 - 2 || document.hidden) return;
      last = now;
      const c = live.current;
      const kind = KINDS[c.motif];
      const w = canvas.width;
      const h = canvas.height;
      if (motif !== c.motif) {
        motif = c.motif;
        parts = Array.from({ length: kind.n }, () => kind.spawn(w, h, true));
      }
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -80 || p.y > h + 80 || p.x < -200 || p.x > w + 200)
          Object.assign(p, kind.spawn(w, h, false));
        kind.draw(ctx, p, t, c);
      }
      const ev = EVENTS[c.motif];
      if (ev) ev(ctx, w, h, (t % EVENT_EVERY) / EVENT_EVERY, c);
      ctx.globalAlpha = 1;
    };
    // Weather starts once the page has settled, so it never competes with first paint.
    const start = () => {
      if (started) return;
      started = true;
      raf = requestAnimationFrame(tick);
    };
    const idle = (
      window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => number }
    ).requestIdleCallback;
    const timer = window.setTimeout(() => (idle ? idle(start, { timeout: 1500 }) : start()), 1200);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [on]);

  return (
    // Full strength in the side gutters, 25% over the reading column, so a pale particle never
    // drags body text under its contrast ratio (Pro Max audit: 14:1 dipped to 1.4:1).
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ maskImage: ATMO_MASK, WebkitMaskImage: ATMO_MASK }}
    />
  );
}
