import { m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Realm } from '../contract';
import { Celebrate, LearnStyles, rootProps, useDur, useFocusEffect } from './shared';

/** A seed that is null on the server and first paint, then fixed: games stay hydration-safe. */
export function useSeed(): [number | null, () => void] {
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => setSeed((Math.random() * 2 ** 31) | 0), []);
  return [seed, () => setSeed((Math.random() * 2 ** 31) | 0)];
}

export function GameShell({
  realm,
  title,
  hint,
  onExit,
  children,
  testId,
}: {
  realm: Realm;
  title: string;
  hint: string;
  onExit: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section {...rootProps(realm)} data-testid={testId} aria-label={title} className="lw w-full">
      <LearnStyles />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" className="lw-btn" onClick={onExit}>
          <span aria-hidden>{'←'}</span> All games
        </button>
        <h2 id="lw-game-title" tabIndex={-1} className="lw-title text-2xl outline-none sm:text-3xl">
          {title}
        </h2>
      </div>
      <p className="lw-muted mb-4">{hint}</p>
      {children}
    </section>
  );
}

/** End-of-round card: warm words, petals / burst, "Play again". Nothing is ranked or shared. */
export function DoneCard({
  realm,
  title,
  body,
  again,
  run,
}: {
  realm: Realm;
  title: string;
  body: string;
  again: () => void;
  run: number;
}) {
  const { dur, ease } = useDur(realm);
  const head = useRef<HTMLHeadingElement>(null);
  // The finished round takes focus (the control that finished it just unmounted).
  useFocusEffect(() => head.current?.focus({ preventScroll: true }), []);
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur(0.4), ease }}
      className="lw-card relative mt-4 flex flex-col items-center gap-3 overflow-hidden p-6 text-center"
      data-testid="game-done"
    >
      <Celebrate realm={realm} run={run} />
      <h3 ref={head} tabIndex={-1} className="lw-title text-3xl outline-none">
        {title}
      </h3>
      <p className="text-lg" role="status">
        {body}
      </p>
      <button
        type="button"
        className="lw-btn"
        data-primary
        onClick={() => {
          again();
          // "Play again" unmounts with the card: focus the game title, which stays.
          requestAnimationFrame(() => document.getElementById('lw-game-title')?.focus());
        }}
      >
        Play again
      </button>
    </m.div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="lw-card p-4" role="status">
      {children}
    </p>
  );
}

export const MORE_ARRIVING = 'More figures are arriving soon. This game will open then.';
