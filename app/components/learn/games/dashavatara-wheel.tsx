/**
 * Dashavatara Wheel: the ten avatars on a slowly turning wheel (labels stay upright). Two common lists
 * exist (the Balarama list and the Buddha list; Wikipedia: Dashavatara), so the eighth and ninth spokes
 * show both, and the order challenge accepts either. Hover, focus or the pause button stills the wheel.
 */
import { AnimatePresence, m } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { avatarLists, avatarSpokes, LIST_NAMES, listsMatching, rng, shuffle } from './logic';
import { useDur, useFocusEffect } from './shared';
import type { GameProps, LearnFigure } from './types';
import { DoneCard, GameShell, MORE_ARRIVING, Note, useSeed } from './ui';

const WIKI = 'https://en.wikipedia.org/wiki/Dashavatara';

export default function DashavataraWheel({ figures, onExit, realm = 'sacred' }: GameProps) {
  const { dur, ease } = useDur(realm);
  const lists = useMemo(() => avatarLists(figures), [figures]);
  const spokes = useMemo(() => avatarSpokes(lists), [lists]);
  const two = !!(lists.balarama && lists.buddha);
  const everyone = useMemo(() => {
    const seen = new Map<string, LearnFigure>();
    for (const sp of spokes) for (const f of sp) seen.set(f.slug, f);
    return [...seen.values()];
  }, [spokes]);
  const [sel, setSel] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<'explore' | 'order'>('explore');
  const [seed, again] = useSeed();
  const [placed, setPlaced] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const trayRef = useRef<HTMLDivElement>(null);
  // The chip you just placed unmounts: hand focus to the first chip still in the tray.
  useFocusEffect(() => {
    if (placed.length > 0 && placed.length < 10)
      trayRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [placed.length]);
  const [run, setRun] = useState(0);
  const tray = useMemo(
    () => (seed === null ? everyone : shuffle(everyone, rng(seed))),
    [seed, everyone],
  );
  const nameOf = (slug: string) => everyone.find((f) => f.slug === slug)?.name ?? slug;

  const ok = !!(lists.balarama || lists.buddha);
  const finished = placed.length === 10;
  const which = finished ? listsMatching(lists, placed)[0] : undefined;

  function place(f: LearnFigure) {
    if (finished) return;
    const next = [...placed, f.slug];
    if (listsMatching(lists, next).length === 0) {
      setMsg('Not yet. Think about who comes next in the story.');
      return;
    }
    setPlaced(next);
    setMsg(next.length === 10 ? '' : 'Yes! Who comes next?');
    if (next.length === 10) setRun((r) => r + 1);
  }
  const restart = () => {
    setPlaced([]);
    setMsg('');
    again();
  };
  const note = two
    ? 'Tellings differ. In one common list Balarama is eighth and Krishna ninth; in another Krishna is eighth and the Buddha ninth. Both are fine.'
    : '';

  return (
    <GameShell
      realm={realm}
      title="Dashavatara Wheel"
      hint={
        mode === 'explore'
          ? 'Tap an avatar to read a mini card. The wheel turns slowly and rests when you hover or focus.'
          : 'Tap the avatars in order, from the first to the last. Either common list is accepted.'
      }
      onExit={onExit}
      testId="game-wheel"
    >
      {!ok ? (
        <Note>{MORE_ARRIVING}</Note>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="lw-btn"
              aria-pressed={mode === 'explore'}
              onClick={() => setMode('explore')}
            >
              Explore the wheel
            </button>
            <button
              type="button"
              className="lw-btn"
              aria-pressed={mode === 'order'}
              onClick={() => {
                setMode('order');
                restart();
              }}
            >
              Put them in order
            </button>
            {mode === 'explore' && (
              <button
                type="button"
                className="lw-btn"
                aria-pressed={paused}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? 'Turn the wheel' : 'Pause the wheel'}
              </button>
            )}
          </div>

          {mode === 'explore' ? (
            <>
              <div
                className="lw-wheel relative mx-auto aspect-square w-[min(100%,340px)] sm:w-[min(100%,460px)]"
                data-paused={paused || undefined}
              >
                <div
                  aria-hidden
                  className="absolute inset-[12%] round"
                  style={{ border: 'var(--lw-bw) dashed var(--lw-line)' }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <p className="lw-title text-xl">Dashavatara</p>
                  <p className="lw-muted text-sm">ten avatars of Vishnu</p>
                </div>
                <ul className="lw-turn absolute inset-0 m-0 list-none p-0">
                  {spokes.map((figs, k) => {
                    const a = (k / 10) * Math.PI * 2;
                    return (
                      <li
                        key={figs.map((f) => f.slug).join('+')}
                        className="absolute"
                        style={{
                          left: `${50 + 40 * Math.sin(a)}%`,
                          top: `${50 - 40 * Math.cos(a)}%`,
                          transform: 'translate(-50%,-50%)',
                        }}
                      >
                        <div className="lw-turn-back">
                          <button
                            type="button"
                            className="lw-btn flex-col gap-0 px-1 py-1 sm:px-2"
                            aria-label={`${k + 1}: ${figs.map((f) => f.name).join(' or ')}`}
                            aria-pressed={sel === k}
                            onClick={() => setSel(k)}
                            data-testid="avatar"
                            style={{ minWidth: 44 }}
                          >
                            <span className="lw-title text-lg">{k + 1}</span>
                            {figs.map((f, i) => (
                              <span key={f.slug} className="hidden text-xs leading-tight sm:block">
                                {i > 0 && <span className="lw-muted">or </span>}
                                {f.name}
                              </span>
                            ))}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:hidden" aria-label="Avatars by number">
                {spokes.map((figs, k) => (
                  <li key={figs.map((f) => f.slug).join('+')}>
                    <button
                      type="button"
                      className="lw-btn w-full justify-start px-2 text-left text-sm"
                      aria-pressed={sel === k}
                      onClick={() => setSel(k)}
                    >
                      <span className="lw-title text-lg">{k + 1}</span>
                      <span className="leading-tight">{figs.map((f) => f.name).join(' or ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {note && (
                <p className="lw-muted mt-4 mb-4" data-testid="lists-note">
                  {note}{' '}
                  <a className="lw-link" href={WIKI} target="_blank" rel="noopener noreferrer">
                    Source: Wikipedia, Dashavatara
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              )}

              <AnimatePresence mode="wait">
                {sel !== null && (
                  <m.div
                    key={sel}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur(0.3), ease }}
                    className="mt-4 grid gap-3"
                    data-testid="avatar-card"
                  >
                    {(spokes[sel] ?? []).map((f) => (
                      <article key={f.slug} className="lw-card p-5">
                        <h3 className="lw-title text-2xl">
                          {sel + 1}. {f.name}
                          {f.native && <span className="lw-muted ml-2 text-lg">{f.native}</span>}
                        </h3>
                        <p className="lw-muted mb-2">{f.role}</p>
                        <p className="text-lg leading-relaxed">
                          {f.kidSummary ?? f.facts[0]?.text}
                        </p>
                        {f.emblems.length > 0 && (
                          <p className="mt-3 flex flex-wrap gap-2">
                            {f.emblems.map((e) => (
                              <span key={e} className="lw-chip">
                                {e}
                              </span>
                            ))}
                          </p>
                        )}
                        <Link
                          className="lw-link mt-2 inline-flex min-h-11 items-center"
                          to={`/sacred/f/${f.slug}`}
                        >
                          Read the full card for {f.name}
                        </Link>
                      </article>
                    ))}
                  </m.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <>
              <ol className="mb-4 grid grid-cols-5 gap-2" aria-label="Your order">
                {Array.from({ length: 10 }, (_, k) => k).map((k) => (
                  <li
                    key={k}
                    className="lw-card flex min-h-14 flex-col items-center justify-center p-1 text-center"
                    style={{ boxShadow: 'none' }}
                    data-testid="order-slot"
                  >
                    <span className="lw-muted text-xs">{k + 1}</span>
                    <span className="text-xs font-semibold">
                      {placed[k] ? nameOf(placed[k] as string) : ' '}
                    </span>
                  </li>
                ))}
              </ol>
              {!finished ? (
                <div ref={trayRef} className="flex flex-wrap gap-2" data-testid="order-tray">
                  {tray
                    .filter((f) => !placed.includes(f.slug))
                    .map((f) => (
                      <button
                        key={f.slug}
                        type="button"
                        className="lw-btn"
                        onClick={() => place(f)}
                        data-testid="order-chip"
                      >
                        {f.name}
                      </button>
                    ))}
                </div>
              ) : (
                <DoneCard
                  realm={realm}
                  run={run}
                  title={realm === 'sacred' ? 'In perfect order' : 'IN ORDER!'}
                  body={`You placed all 10 avatars in order${which && two ? `: that is the ${LIST_NAMES[which]}` : ''}.`}
                  again={restart}
                />
              )}
              <p className="lw-muted mt-3 min-h-6" role="status">
                {msg}
              </p>
            </>
          )}
        </>
      )}
    </GameShell>
  );
}
