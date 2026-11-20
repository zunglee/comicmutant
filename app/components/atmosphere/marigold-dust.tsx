/**
 * Desi-heroes atmosphere (skin kind 'marigold-dust'): marigold petals and sparks in saffron, vermilion and green drifting softly upward. One canvas at <= 30 fps that pauses while the tab is hidden
 * or `hidden` is set. `strength` is the opacity over the reading column; a mask lifts it to full at
 * the edges. Under reduced motion or Lite FX one still frame is painted and nothing moves.
 * Colours come from the skin's CSS variables (--c3 saffron, --c1 vermilion, --c2 green), re-read often,
 * so a skin or character accent change recolours the dust. Confetti only: nothing that reads as a flag.
 */
import { useEffect, useRef } from 'react';
import { useAnimate } from '~/lib/fx';

interface Mote {
  x: number;
  y: number;
  s: number;
  vy: number;
  ph: number;
  rot: number;
  vr: number;
  a: number;
  tone: 0 | 1 | 2;
  spark: boolean;
}

const COUNT = 34;
const FPS = 30;

export default function MarigoldDust({
  hidden = false,
  strength,
}: {
  hidden?: boolean;
  strength: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const animate = useAnimate();
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let frames = 0;
    let colors = ['orange', 'white', 'green'];
    let ink = 'navy';
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const get = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
      colors = [get('--c3', 'orange'), get('--c1', 'red'), get('--c2', 'green')];
      ink = get('--line', 'navy');
    };
    const mote = (init: boolean): Mote => ({
      x: rnd(0, w),
      y: init ? rnd(0, h) : h + rnd(10, 60),
      s: rnd(4, 9),
      vy: rnd(0.25, 0.7),
      ph: rnd(0, 6.28),
      rot: rnd(0, 6.28),
      vr: rnd(-0.02, 0.02),
      a: rnd(0.55, 0.95),
      tone: ([0, 0, 1, 2] as const)[Math.floor(Math.random() * 4)] ?? 0,
      spark: Math.random() < 0.35,
    });
    let motes: Mote[] = [];
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        ctx.save();
        ctx.translate(m.x + Math.sin(t * 0.6 + m.ph) * 10, m.y);
        ctx.rotate(m.rot);
        ctx.globalAlpha = m.a;
        ctx.fillStyle = colors[m.tone] ?? 'orange';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (m.spark) {
          // four-point spark
          const r = m.s * 0.9;
          const q = r * 0.28;
          ctx.moveTo(0, -r);
          ctx.lineTo(q, -q);
          ctx.lineTo(r, 0);
          ctx.lineTo(q, q);
          ctx.lineTo(0, r);
          ctx.lineTo(-q, q);
          ctx.lineTo(-r, 0);
          ctx.lineTo(-q, -q);
          ctx.closePath();
        } else {
          // marigold petal: a pointed leaf
          ctx.moveTo(-m.s, 0);
          ctx.quadraticCurveTo(0, -m.s * 0.9, m.s, 0);
          ctx.quadraticCurveTo(0, m.s * 0.9, -m.s, 0);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    };
    const size = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      if (!animate) draw(0);
    };
    readColors();
    size();
    motes = Array.from({ length: COUNT }, () => mote(true));
    draw(0);
    window.addEventListener('resize', size);
    if (!animate) {
      return () => {
        window.removeEventListener('resize', size);
        ctx.clearRect(0, 0, w, h);
      };
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / FPS - 2 || document.hidden || hiddenRef.current) return;
      last = now;
      if (++frames % 90 === 0) readColors();
      for (const m of motes) {
        m.y -= m.vy;
        m.rot += m.vr;
        if (m.y < -30) Object.assign(m, mote(false));
      }
      draw(now / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      ctx.clearRect(0, 0, w, h);
    };
  }, [animate]);

  // Full strength at both edges, `strength` across the middle (where the text is).
  const q = Math.max(0, Math.min(1, strength));
  const mask = `linear-gradient(90deg, black 0, black 8%, rgb(0 0 0 / ${q}) 26%, rgb(0 0 0 / ${q}) 74%, black 92%, black 100%)`;
  return (
    <canvas
      ref={ref}
      aria-hidden
      data-testid="marigold-dust"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}
