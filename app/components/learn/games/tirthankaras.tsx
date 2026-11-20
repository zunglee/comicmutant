/**
 * The 24 Tirthankaras: a grid of names with the symbol (lanchhana) each is known by, as text, and a
 * calm memory-pairs game (name and symbol). Cards turn slowly in Sacred.
 */
import { m } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { inGroup, lanchhanaText, memoryDeck, rng } from './logic';
import { Icon, useDur } from './shared';
import type { GameProps } from './types';
import { DoneCard, GameShell, MORE_ARRIVING, Note, useSeed } from './ui';

export default function Tirthankaras({ figures, onExit, realm = 'sacred' }: GameProps) {
  const { dur, ease, calm } = useDur(realm);
  const all = useMemo(() => inGroup(figures, 'tirthankara').slice(0, 24), [figures]);
  const [mode, setMode] = useState<'grid' | 'memory'>('grid');
  const [seed, again] = useSeed();
  const deck = useMemo(() => (seed === null ? [] : memoryDeck(all, rng(seed))), [seed, all]);
  const [up, setUp] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [tries, setTries] = useState(0);
  const [run, setRun] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const total = deck.length / 2;
  const finished = total > 0 && matched.length === total;

  function flip(id: string) {
    if (up.length >= 2 || up.includes(id)) return;
    const next = [...up, id];
    setUp(next);
    if (next.length === 2) {
      setTries((t) => t + 1);
      const [a, b] = next.map((x) => deck.find((c) => c.id === x));
      if (a && b && a.pair === b.pair) {
        timer.current = setTimeout(() => {
          const m2 = [...matched, a.pair];
          setMatched(m2);
          setUp([]);
          if (m2.length === total) setRun((r) => r + 1);
        }, dur(0.5) * 1000);
      } else {
        timer.current = setTimeout(() => setUp([]), 1400);
      }
    }
  }
  const restart = () => {
    if (timer.current) clearTimeout(timer.current);
    setUp([]);
    setMatched([]);
    setTries(0);
    again();
  };

  return (
    <GameShell
      realm={realm}
      title="The 24 Tirthankaras"
      hint={
        mode === 'grid'
          ? 'Each Tirthankara is known by a symbol, shown here as words.'
          : 'Turn two cards to pair a name with its symbol.'
      }
      onExit={onExit}
      testId="game-tirthankaras"
    >
      {all.length < 4 ? (
        <Note>{MORE_ARRIVING}</Note>
      ) : (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: a labelled button group, not form fields. */}
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Mode">
            <button
              type="button"
              className="lw-btn"
              aria-pressed={mode === 'grid'}
              onClick={() => setMode('grid')}
            >
              See all {all.length}
            </button>
            <button
              type="button"
              className="lw-btn"
              aria-pressed={mode === 'memory'}
              onClick={() => {
                setMode('memory');
                restart();
              }}
            >
              Memory pairs
            </button>
          </div>
          {mode === 'grid' ? (
            <ul
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
              data-testid="tirth-grid"
            >
              {all.map((f, k) => (
                <m.li
                  key={f.slug}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: dur(0.3),
                    delay: Math.min(k, 12) * (calm ? 0.05 : 0.02),
                    ease,
                  }}
                  className="lw-card p-3"
                  style={{ boxShadow: 'none' }}
                >
                  <span className="lw-muted text-xs">{f.order || k + 1}</span>
                  <span className="lw-title block text-lg [overflow-wrap:anywhere]">{f.name}</span>
                  <span className="lw-muted text-sm">{lanchhanaText(f) ?? 'Symbol to come'}</span>
                </m.li>
              ))}
            </ul>
          ) : (
            <>
              <p className="lw-muted mb-3" role="status" data-testid="memory-status">
                Pairs found: {matched.length} of {total} · Tries: {tries}
              </p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="memory-grid">
                {deck.map((c, ci) => {
                  const shown = up.includes(c.id) || matched.includes(c.pair);
                  const done = matched.includes(c.pair);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="lw-btn min-h-20 w-full p-1"
                        aria-label={`Card ${ci + 1} of ${deck.length}, ${shown ? `${c.kind === 'name' ? 'name' : 'symbol'}: ${c.text}` : 'face down'}`}
                        aria-pressed={shown}
                        aria-disabled={done || undefined}
                        onClick={() => !done && flip(c.id)}
                        data-testid="memory-card"
                        data-pair={c.pair}
                        style={
                          done
                            ? {
                                background: 'var(--lw-good-bg)',
                                borderColor: 'var(--lw-good)',
                                opacity: 1,
                              }
                            : undefined
                        }
                      >
                        <m.span
                          key={shown ? 'front' : 'back'}
                          className="flex h-full w-full items-center justify-center text-center text-sm font-semibold [overflow-wrap:anywhere]"
                          initial={{ scaleX: 0.1, opacity: 0 }}
                          animate={{ scaleX: 1, opacity: 1 }}
                          transition={{ duration: dur(0.3), ease }}
                          style={{ hyphens: 'auto' }}
                          lang="en"
                        >
                          {shown ? (
                            <span>
                              {done && <span aria-hidden>{'✓ '}</span>}
                              {c.text}
                              <span className="lw-muted block text-xs">
                                {c.kind === 'name' ? 'name' : 'symbol'}
                              </span>
                            </span>
                          ) : (
                            <span aria-hidden style={{ color: 'var(--lw-accent)' }}>
                              <Icon name="flower" size={30} />
                            </span>
                          )}
                        </m.span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {finished && (
                <DoneCard
                  realm={realm}
                  run={run}
                  title={realm === 'sacred' ? 'Every pair found' : 'ALL PAIRED!'}
                  body={`You paired all ${total} in ${tries} tries. Just for you, never ranked.`}
                  again={restart}
                />
              )}
            </>
          )}
        </>
      )}
    </GameShell>
  );
}
