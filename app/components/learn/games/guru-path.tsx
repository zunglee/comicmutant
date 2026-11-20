/** Path of the Ten Gurus: a lamp-lit path in order with years, then a gentle "who came next?" game. */
import { m } from 'motion/react';
import { useMemo, useState } from 'react';
import { inGroup, nextRounds, rng, yearsOf } from './logic';
import { Diya, useDur, useRefocus } from './shared';
import type { GameProps } from './types';
import { DoneCard, GameShell, MORE_ARRIVING, Note, useSeed } from './ui';

export default function GuruPath({ figures, onExit, realm = 'sacred' }: GameProps) {
  const { dur, ease, calm } = useDur(realm);
  const gurus = useMemo(() => inGroup(figures, 'guru').slice(0, 10), [figures]);
  const [open, setOpen] = useState<string | null>(null);
  const [seed, again] = useSeed();
  const rounds = useMemo(() => (seed === null ? [] : nextRounds(gurus, rng(seed))), [seed, gurus]);
  const [r, setR] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const [run, setRun] = useState(0);
  const cur = rounds[r];
  const qHead = useRefocus<HTMLParagraphElement>(r); // the next question takes focus from the Next button
  const finished = rounds.length > 0 && r >= rounds.length;

  const restart = () => {
    setR(0);
    setPick(null);
    setRight(0);
    again();
  };
  const choose = (slug: string) => {
    if (!cur || pick) return;
    setPick(slug);
    if (slug === cur.answer) setRight((x) => x + 1);
  };
  const advance = () => {
    if (r + 1 >= rounds.length) setRun((x) => x + 1);
    setR((x) => x + 1);
    setPick(null);
  };

  return (
    <GameShell
      realm={realm}
      title="Path of the Ten Gurus"
      hint="Follow the lamps from the first Guru to the tenth. Tap a lamp to read more, then play Who came next?"
      onExit={onExit}
      testId="game-gurus"
    >
      {gurus.length < 3 ? (
        <Note>{MORE_ARRIVING}</Note>
      ) : (
        <>
          <ol className="relative mb-6 grid gap-1 pl-2" aria-label="The Gurus in order">
            <m.span
              aria-hidden
              className="absolute top-4 bottom-4 left-[28px] w-1 origin-top round"
              style={{ background: 'var(--lw-accent)', opacity: 0.45 }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: dur(gurus.length * 0.35), ease: 'linear' }}
            />
            {gurus.map((g, k) => (
              <m.li
                key={g.slug}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: dur(0.4),
                  delay: calm ? k * 0.25 : k * 0.08,
                  ease,
                }}
                className="relative"
                data-testid="guru"
              >
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center gap-3 text-left"
                  style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }}
                  aria-expanded={open === g.slug}
                  onClick={() => setOpen(open === g.slug ? null : g.slug)}
                >
                  <span
                    className="relative z-[1] grid h-11 w-11 shrink-0 place-items-center round"
                    style={{ background: 'var(--lw-bg)' }}
                  >
                    <Diya lit size={36} />
                  </span>
                  <span>
                    <span className="lw-title block text-xl">
                      {k + 1}. {g.name}
                    </span>
                    <span className="lw-muted text-sm">{yearsOf(g) ?? g.role}</span>
                  </span>
                </button>
                {open === g.slug && (
                  <m.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: dur(0.3) }}
                    className="lw-card mt-1 mb-2 ml-14 p-3 text-lg leading-relaxed"
                  >
                    {g.kidSummary ?? g.role}
                  </m.p>
                )}
              </m.li>
            ))}
          </ol>

          <div className="lw-card relative p-5" data-testid="next-game">
            <h3 className="lw-title mb-3 text-2xl">Who came next?</h3>
            {!cur && !finished && <p className="lw-muted">Lighting the lamps{'…'}</p>}
            {cur && (
              <>
                <p ref={qHead} tabIndex={-1} className="mb-3 text-xl outline-none" id="gp-q">
                  {cur.prompt}
                </p>
                <ul className="grid gap-2 sm:grid-cols-2" aria-labelledby="gp-q">
                  {cur.options.map((o) => {
                    const isAns = pick !== null && o.slug === cur.answer;
                    const isMine = pick === o.slug;
                    return (
                      <li key={o.slug}>
                        <button
                          type="button"
                          className="lw-btn w-full"
                          aria-pressed={isMine}
                          aria-disabled={(pick !== null && !isAns && !isMine) || undefined}
                          onClick={() => choose(o.slug)}
                          style={
                            isAns
                              ? { background: 'var(--lw-good-bg)', borderColor: 'var(--lw-good)' }
                              : undefined
                          }
                        >
                          {isAns && <span aria-hidden>{'✓ '}</span>}
                          {o.name}
                          {isAns && <span className="text-sm"> (came next)</span>}
                          {isMine && !isAns && <span className="text-sm"> (your pick)</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {pick && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p role="status" className="text-lg">
                      {pick === cur.answer
                        ? 'Yes, well done!'
                        : 'Good try. The lamps show the way.'}
                    </p>
                    <button type="button" className="lw-btn" data-primary onClick={advance}>
                      {r + 1 >= rounds.length ? 'Finish' : 'Next'}
                    </button>
                  </div>
                )}
              </>
            )}
            {finished && (
              <DoneCard
                realm={realm}
                run={run}
                title="The path is lit"
                body={`You knew ${right} of ${rounds.length}. Walk it again any time.`}
                again={restart}
              />
            )}
          </div>
        </>
      )}
    </GameShell>
  );
}
