/**
 * Crime-city weather (skin kind 'neon-rain'): slow diagonal rain streaks, an occasional neon sign
 * flickering in a corner, and a siren light sweeping across the top. All abstract shapes, nothing
 * drawn from a game or a brand. One canvas at device-pixel-ratio 1, <= 30 fps, full strength in the
 * side gutters and `strength` (0.25) over the reading column so rain never drags text contrast down.
 * Pauses when the tab is hidden, when off screen, or while a game plays (`hidden`); under reduced
 * motion or Lite FX it paints one still frame and stops. Colours are read from the CSS variables.
 */
import { useEffect, useRef } from 'react';
import { useAnimate } from '~/lib/fx';

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
  a: number;
}

const SLANT = 0.22; // horizontal travel per vertical pixel
const DROPS = 70;
const R = Math.random;

const mask = (strength: number) => {
  const mid = Math.max(0, Math.min(1, strength));
  return `linear-gradient(90deg, black 0, black 8%, rgb(0 0 0 / ${mid}) 22%, rgb(0 0 0 / ${mid}) 78%, black 92%, black 100%)`; // token-ok: mask alpha ramp, not a colour
};

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export default function NeonRain({
  hidden = false,
  strength,
}: {
  hidden?: boolean;
  strength: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const animate = useAnimate();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || hidden) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    let drops: Drop[] = [];
    // Read once per mount; a skin or theme change remounts through the atmosphere switch.
    const cRain = cssVar('--c3', 'cyan');
    const cSign = cssVar('--c2', 'magenta');
    const cSiren = cssVar('--c1', 'orange');

    const drop = (init: boolean): Drop => ({
      x: R() * (w + h * SLANT) - h * SLANT,
      y: init ? R() * h : -40,
      len: 14 + R() * 26,
      v: 5 + R() * 5,
      a: 0.18 + R() * 0.3,
    });
    const size = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    const sign = (t: number) => {
      // A bar sign top-right that stutters on and off on a 9 s loop.
      const k = (t % 9) / 9;
      const on = k < 0.12 ? (Math.sin(k * 160) > 0 ? 1 : 0.15) : k < 0.8 ? 1 : 0.55;
      ctx.save();
      ctx.globalAlpha = 0.5 * on;
      ctx.strokeStyle = cSign;
      ctx.shadowColor = cSign;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3;
      const x = w - 150;
      const y = 120;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 90, y);
      ctx.lineTo(x + 110, y + 20);
      ctx.lineTo(x + 110, y + 50);
      ctx.moveTo(x + 14, y + 22);
      ctx.lineTo(x + 70, y + 22);
      ctx.stroke();
      ctx.restore();
    };

    const siren = (t: number) => {
      // A soft wedge of light sliding left to right along the top every 7 s.
      const k = (t % 7) / 7;
      const cx = -w * 0.2 + k * w * 1.4;
      const g = ctx.createLinearGradient(cx - 160, 0, cx + 160, 0);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, cSiren);
      g.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalAlpha = 0.16 * Math.sin(k * Math.PI);
      ctx.fillStyle = g;
      ctx.fillRect(cx - 160, 0, 320, 72);
      ctx.restore();
    };

    const frame = (t: number, step: boolean) => {
      ctx.clearRect(0, 0, w, h);
      siren(t);
      sign(t);
      ctx.strokeStyle = cRain;
      ctx.lineWidth = 1;
      for (const d of drops) {
        if (step) {
          d.y += d.v;
          d.x += d.v * SLANT;
          if (d.y > h + 40) Object.assign(d, drop(false));
        }
        ctx.globalAlpha = d.a;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * SLANT, d.y + d.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / 30 - 2 || document.hidden || !onScreen) return;
      last = now;
      frame(now / 1000, true);
    };

    size();
    drops = Array.from({ length: DROPS }, () => drop(true));
    const onResize = () => {
      size();
      if (!animate) frame(2.5, false);
    };
    window.addEventListener('resize', onResize);
    if (!animate) {
      frame(2.5, false); // one still frame: reduced motion and Lite FX
    } else {
      const io = new IntersectionObserver(([e]) => {
        onScreen = e?.isIntersecting ?? true;
      });
      io.observe(canvas);
      raf = requestAnimationFrame(tick);
      return () => {
        io.disconnect();
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        ctx.clearRect(0, 0, w, h);
      };
    }
    return () => window.removeEventListener('resize', onResize);
  }, [animate, hidden]);

  const m = mask(strength);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="cr-canvas"
      style={{ maskImage: m, WebkitMaskImage: m }}
    />
  );
}
