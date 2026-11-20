/**
 * The weather of Sacred India: a very slow mandala turning, a breathing wash of light, floating diyas
 * and drifting petals. Calm by rule (S8): nothing flashes, nothing bursts. The mandala and the light
 * are CSS (stilled by reduced motion); diyas and petals are one canvas at <= 24 fps that pauses while
 * the tab is hidden and does not exist under reduced motion or Lite FX.
 */
import { useEffect, useRef } from 'react';
import { useAnimate } from '~/lib/fx';

// A luminance-free alpha mask: only the alpha channel matters, so 'black' is not a theme colour.
const MASK =
  'linear-gradient(90deg, black 0, black 7%, rgb(0 0 0 / 0.3) 24%, rgb(0 0 0 / 0.3) 76%, black 93%, black 100%)';

type RGB = [number, number, number];

/** '#rrggbb' / '#rgb' to numbers; anything else (a named colour, a function) gives the fallback. */
function parseHex(v: string, fallback: RGB): RGB {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(v);
  if (!m?.[1]) return fallback;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as RGB;
}
/** `k` of colour `a` over `b`, as an rgb() string the canvas always understands (alpha optional). */
const mix = (a: RGB, b: RGB, k: number, alpha = 1) =>
  `rgb(${a.map((x, i) => Math.round(x * k + (b[i] as number) * (1 - k))).join(' ')} / ${alpha})`;

/** The canvas cannot read CSS variables: resolve the skin's accents once, at mount. */
function readTones() {
  const cs = getComputedStyle(document.documentElement);
  const c1 = parseHex(cs.getPropertyValue('--c1').trim(), [232, 137, 47]);
  const c2 = parseHex(cs.getPropertyValue('--c2').trim(), [194, 65, 122]);
  const light: RGB = [255, 255, 255];
  const dark: RGB = [0, 0, 0];
  return {
    petal: mix(c2, light, 0.55),
    glow: mix(c1, light, 0.55, 0.5),
    glowEdge: mix(c1, light, 0.55, 0),
    bowl: mix(c1, dark, 0.8),
    flame: mix(c1, light, 0.35),
  };
}

function Mandala() {
  const rings = [
    { n: 8, r1: 120, r2: 200 },
    { n: 16, r1: 200, r2: 260 },
    { n: 24, r1: 260, r2: 330 },
  ];
  return (
    <svg viewBox="-340 -340 680 680" className="sa-mandala" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        {[60, 120, 200, 260, 330].map((r) => (
          <circle key={r} r={r} />
        ))}
        {rings.map(({ n, r1, r2 }) =>
          Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2;
            const m = (r1 + r2) / 2;
            const w = ((r2 - r1) / 2) * 0.62;
            const cx = Number((Math.cos(a) * m).toFixed(2));
            const cy = Number((Math.sin(a) * m).toFixed(2));
            return (
              <ellipse
                key={`${n}-${cx.toFixed(1)}-${cy.toFixed(1)}`}
                cx={cx}
                cy={cy}
                rx={(r2 - r1) / 2}
                ry={w}
                transform={`rotate(${Math.round((a * 180) / Math.PI)} ${cx} ${cy})`}
              />
            );
          }),
        )}
      </g>
    </svg>
  );
}

interface Petal {
  x: number;
  y: number;
  s: number;
  v: number;
  ph: number;
  rot: number;
  a: number;
}
interface Diya {
  x: number;
  y: number;
  v: number;
  ph: number;
  life: number;
  max: number;
}

export function SacredAtmosphere() {
  const ref = useRef<HTMLCanvasElement>(null);
  const animate = useAnimate();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !animate) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    const tone = readTones();
    let petals: Petal[] = [];
    let diyas: Diya[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const petal = (init: boolean): Petal => ({
      x: rnd(0, w),
      y: init ? rnd(-h * 0.1, h) : rnd(-60, -10),
      s: rnd(6, 12),
      v: rnd(0.12, 0.3),
      ph: rnd(0, 6.28),
      rot: rnd(0, 6.28),
      a: rnd(0.22, 0.4),
    });
    const diya = (init: boolean): Diya => ({
      x: rnd(0.05, 0.95) * w,
      y: init ? rnd(0.3, 1) * h : h + 20,
      v: rnd(0.1, 0.22),
      ph: rnd(0, 6.28),
      life: init ? rnd(0, 0.5) : 0,
      max: rnd(900, 1500),
    });
    const size = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    size();
    petals = Array.from({ length: 14 }, () => petal(true));
    diyas = Array.from({ length: 6 }, () => diya(true));
    window.addEventListener('resize', size);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / 24 - 2 || document.hidden) return;
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of petals) {
        p.y += p.v;
        p.x += Math.sin(t * 0.5 + p.ph) * 0.35;
        p.rot += 0.004;
        if (p.y > h + 30) Object.assign(p, petal(false));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = tone.petal;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.s, p.s * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (const d of diyas) {
        d.y -= d.v;
        d.life += 1;
        d.x += Math.sin(t * 0.4 + d.ph) * 0.25;
        const k = d.life / d.max;
        if (k >= 1) Object.assign(d, diya(false));
        const fade = Math.min(1, k * 6, (1 - k) * 6);
        const flick = 1 + Math.sin(t * 1.7 + d.ph) * 0.07;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.globalAlpha = Math.max(0, fade) * 0.85;
        const g = ctx.createRadialGradient(0, -8, 1, 0, -8, 34 * flick);
        g.addColorStop(0, tone.glow);
        g.addColorStop(1, tone.glowEdge);
        ctx.fillStyle = g;
        ctx.fillRect(-36, -44, 72, 72);
        ctx.fillStyle = tone.bowl;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = tone.flame;
        ctx.beginPath();
        ctx.ellipse(0, -7, 3, 7 * flick, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      ctx.clearRect(0, 0, w, h);
    };
  }, [animate]);

  return (
    <div className="sa-root" aria-hidden>
      <div className="sa-light" />
      <Mandala />
      <canvas ref={ref} className="sa-canvas" style={{ maskImage: MASK, WebkitMaskImage: MASK }} />
    </div>
  );
}
