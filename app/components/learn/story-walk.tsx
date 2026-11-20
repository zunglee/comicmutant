/**
 * StoryWalk: a story told one scene at a time. Pages turn gently, and a path of diyas lights up as
 * you go. Arrow keys, buttons and swipes all work. Text only, never a drawing of a deity.
 */
import { AnimatePresence, m } from 'motion/react';
import { useRef, useState } from 'react';
import type { Realm } from './contract';
import { Celebrate, Diya, LearnStyles, rootProps, useDur } from './games/shared';

export interface StoryWalkProps {
  steps: readonly { title: string; text: string }[];
  realm: Realm;
  title?: string;
}

export function StoryWalk({ steps, realm, title }: StoryWalkProps) {
  const { dur, ease, calm } = useDur(realm);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [done, setDone] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const n = steps.length;
  const step = steps[i];
  if (!step) return null;
  const last = i === n - 1;

  const go = (d: number) => {
    const next = i + d;
    if (next < 0 || next >= n) return;
    setDir(d);
    setI(next);
    if (next === n - 1) setDone((x) => x + 1);
  };
  const restart = () => {
    setDir(-1);
    setI(0);
  };

  return (
    <section
      {...rootProps(realm)}
      aria-label={title ?? 'Story walk'}
      className="lw relative mx-auto w-full max-w-xl"
      data-testid="story-walk"
    >
      <LearnStyles />
      {title && <h2 className="lw-title mb-3 text-2xl">{title}</h2>}

      <ol className="mb-3 flex items-end justify-between gap-1" aria-label="Story progress">
        {steps.map((s, k) => (
          <li key={s.title} className="flex-1" aria-current={k === i ? 'step' : undefined}>
            <button
              type="button"
              className="mx-auto flex min-h-11 w-full min-w-11 items-center justify-center"
              onClick={() => {
                setDir(k > i ? 1 : -1);
                setI(k);
                if (k === n - 1) setDone((x) => x + 1);
              }}
              aria-label={`Scene ${k + 1}: ${s.title}`}
              style={{
                background: 'none',
                border: 0,
                cursor: 'pointer',
                opacity: k <= i ? 1 : 0.55,
                transition: 'opacity .6s',
              }}
            >
              <Diya lit={k <= i} size={30} />
            </button>
          </li>
        ))}
      </ol>

      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard target for arrow-key paging.
        tabIndex={0}
        aria-label="Story page. Use the left and right arrow keys."
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(-1);
          }
        }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5)
            go(dx < 0 ? 1 : -1);
        }}
        className="relative rounded-[var(--lw-r)]"
        style={{ touchAction: 'pan-y', perspective: 900 }}
      >
        <div className="relative" style={{ minHeight: 250 }}>
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <m.article
              key={i}
              custom={dir}
              variants={{
                in: (d: number) => ({
                  opacity: 0,
                  x: d * 40,
                  rotateY: calm ? d * -14 : d * -24,
                }),
                show: { opacity: 1, x: 0, rotateY: 0 },
                out: (d: number) => ({
                  opacity: 0,
                  x: d * -40,
                  rotateY: calm ? d * 14 : d * 24,
                }),
              }}
              initial="in"
              animate="show"
              exit="out"
              transition={{ duration: dur(0.35), ease }}
              className="lw-card relative flex w-full flex-col gap-3 p-5"
              style={{ transformOrigin: 'left center' }}
              data-testid="story-page"
            >
              <p className="lw-muted text-sm">
                Scene {i + 1} of {n}
              </p>
              <h3 className="lw-title text-2xl">{step.title}</h3>
              <p className="text-lg leading-relaxed">{step.text}</p>
            </m.article>
          </AnimatePresence>
          <Celebrate realm={realm} run={last ? done : 0} />
        </div>
      </section>

      <p className="sr-only" role="status">
        Scene {i + 1} of {n}: {step.title}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" className="lw-btn" onClick={() => go(-1)} aria-disabled={i === 0}>
          <span aria-hidden>{'←'}</span> Back
        </button>
        {last ? (
          <button type="button" className="lw-btn" data-primary onClick={restart}>
            Read again
          </button>
        ) : (
          <button type="button" className="lw-btn" data-primary onClick={() => go(1)}>
            Next <span aria-hidden>{'→'}</span>
          </button>
        )}
      </div>
    </section>
  );
}
