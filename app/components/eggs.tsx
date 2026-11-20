/**
 * Easter eggs + cursor trail (Rich FX, fine pointer, no reduced motion):
 *  - Konami code (↑↑↓↓←→←→BA) → POWER UP: a storm of sound-effect stickers;
 *  - typing "kapow" anywhere outside a field → the same storm;
 *  - typing "mutant" → the site re-skins itself as a random character;
 *  - a spark trail in the theme's colours follows the cursor.
 */
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SFX } from '~/lib/clips/motifs';
import { useAnimate } from '~/lib/fx';
import { useTheme } from '~/lib/theme/context';
import { useSkinMotion } from '~/skins/motion';

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

interface Toast {
  id: number;
  text: string;
}
interface Sticker {
  id: number;
  x: number;
  y: number;
  r: number;
  word: string;
}
interface Spark {
  id: number;
  x: number;
  y: number;
  c: string;
}

let ids = 1;

function typingInField(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function EasterEggs() {
  const mo = useSkinMotion();
  const animate = useAnimate();
  const { current, equip } = useTheme();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const keys = useRef<string[]>([]);
  const typed = useRef('');

  const toast = useCallback((text: string) => {
    const id = ids++;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const storm = useCallback(() => {
    const words = [...SFX[current.motif], 'KAPOW!', 'BLAM!', 'ZING!'];
    const batch = Array.from({ length: 10 }, (_, i) => ({
      id: ids++,
      x: 8 + Math.random() * 78,
      y: 10 + Math.random() * 70,
      r: (Math.random() - 0.5) * 30,
      word: words[i % words.length] ?? 'POW!',
    }));
    setStickers(batch);
    setTimeout(() => setStickers([]), 1800);
  }, [current.motif]);

  const roulette = useCallback(async () => {
    try {
      const res = await fetch('/themes/index.json');
      const { themes } = (await res.json()) as {
        themes: { slug: string; name: string; v: string }[];
      };
      const pick = themes[Math.floor(Math.random() * themes.length)];
      if (!pick) return;
      await equip(
        { slug: pick.slug, v: pick.v },
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      );
      toast(`MUTATED INTO ${pick.name.toUpperCase()}!`);
    } catch {
      toast('The mutation fizzled. Try again!');
    }
  }, [equip, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingInField(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      keys.current = [...keys.current, e.key].slice(-KONAMI.length);
      if (keys.current.join() === KONAMI.join()) {
        keys.current = [];
        toast('POWER UP! Konami code accepted.');
        if (animate) storm();
      }
      if (e.key.length === 1) {
        typed.current = (typed.current + e.key.toLowerCase()).slice(-12);
        if (typed.current.endsWith('kapow')) {
          typed.current = '';
          toast('KAPOW! You found an easter egg.');
          if (animate) storm();
        }
        if (typed.current.endsWith('mutant')) {
          typed.current = '';
          roulette();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [animate, storm, roulette, toast]);

  // Cursor trail: throttled, capped, fine pointers only.
  useEffect(() => {
    if (!animate || !window.matchMedia('(pointer: fine)').matches) return;
    let last = 0;
    const colors = [current.vars['--c3'] ?? '#ffd400', current.vars['--c1'] ?? '#ff2e4d'];
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      const id = ids++;
      setSparks((s) => [
        ...s.slice(-10),
        { id, x: e.clientX, y: e.clientY, c: colors[id % 2] ?? '#ffd400' },
      ]);
      setTimeout(() => setSparks((s) => s.filter((x) => x.id !== id)), 500);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [animate, current.vars]);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[140] overflow-hidden">
        {sparks.map((s) => (
          <m.svg
            key={s.id}
            viewBox="-10 -10 20 20"
            className="absolute size-4"
            style={{ left: s.x - 8, top: s.y - 8 }}
            initial={{ scale: 1, rotate: 0, y: 0 }}
            animate={{ scale: 0, rotate: 90, y: 14 }}
            transition={mo.tween(0.5, { ease: 'easeOut' })}
          >
            <polygon
              points="0,-9 2.5,-2.5 9,0 2.5,2.5 0,9 -2.5,2.5 -9,0 -2.5,-2.5"
              fill={s.c}
              stroke="#0d0b10"
              strokeWidth="1.5"
            />
          </m.svg>
        ))}
        <AnimatePresence>
          {stickers.map((s, i) => (
            <m.div
              key={s.id}
              className="burst absolute grid size-36 place-items-center bg-c3 font-display text-3xl text-on-c3"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              initial={{ scale: 0, rotate: s.r - 30 }}
              animate={{ scale: 1, rotate: s.r }}
              exit={{ scale: 0, opacity: 0, transition: mo.tween(0.2) }}
              transition={mo.spring({ stiffness: 500, damping: 14 }, mo.delay(i, 0.06))}
            >
              {s.word}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      <div
        className="pointer-events-none fixed inset-x-0 top-20 z-[160] flex flex-col items-center gap-2"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <m.p
              key={t.id}
              className="bubble font-head text-sm"
              initial={{ y: -20, scale: 0.8, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: -10, opacity: 0, transition: mo.tween(0.15) }}
            >
              {t.text}
            </m.p>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
