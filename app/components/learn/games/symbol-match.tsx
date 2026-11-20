/** Symbol Match: tap (or drag) a figure's name onto its emblem or mount. Emblems are text only. */
import { useMemo, useState } from 'react';
import { rng, symbolRound } from './logic';
import type { GameProps } from './types';
import { DoneCard, GameShell, MORE_ARRIVING, Note, useSeed } from './ui';

export default function SymbolMatch({ figures, onExit, realm = 'sacred' }: GameProps) {
  const [seed, again] = useSeed();
  const round = useMemo(
    () => (seed === null ? null : symbolRound(figures, rng(seed))),
    [seed, figures],
  );
  const [sel, setSel] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [run, setRun] = useState(0);

  const restart = () => {
    setSel(null);
    setDone([]);
    setMsg('');
    again();
  };

  function tryMatch(nameSlug: string, emblemSlug: string) {
    if (nameSlug === emblemSlug) {
      const next = [...done, nameSlug];
      setDone(next);
      setSel(null);
      setMsg('Yes! A lovely match.');
      if (round && next.length === round.names.length) setRun((r) => r + 1);
    } else {
      setSel(null);
      setMsg('Not this pair. Have another look, no hurry.');
    }
  }

  return (
    <GameShell
      realm={realm}
      title="Symbol Match"
      hint="Pick a name, then pick the emblem or mount that goes with it. You can also drag a name onto an emblem."
      onExit={onExit}
      testId="game-symbols"
    >
      {!round || round.names.length < 3 ? (
        <Note>{MORE_ARRIVING}</Note>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <ul className="grid content-start gap-2" aria-label="Names">
              {round.names.map((n) => {
                const ok = done.includes(n.slug);
                return (
                  <li key={n.slug}>
                    <button
                      type="button"
                      className="lw-btn w-full"
                      draggable={!ok}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', n.slug);
                        setSel(n.slug);
                      }}
                      aria-disabled={ok || undefined}
                      aria-pressed={sel === n.slug}
                      data-testid="match-name"
                      data-slug={n.slug}
                      onClick={() => !ok && setSel(sel === n.slug ? null : n.slug)}
                      style={{
                        transform: sel === n.slug ? 'scale(1.04)' : undefined,
                        ...(ok
                          ? { background: 'var(--lw-good-bg)', borderColor: 'var(--lw-good)' }
                          : {}),
                      }}
                    >
                      {ok && <span aria-hidden>{'✓ '}</span>}
                      {n.name}
                    </button>
                  </li>
                );
              })}
            </ul>
            <ul className="grid content-start gap-2" aria-label="Emblems and mounts">
              {round.emblems.map((e) => {
                const ok = done.includes(e.slug);
                return (
                  <li key={e.slug}>
                    <button
                      type="button"
                      className="lw-btn w-full"
                      aria-disabled={ok || undefined}
                      data-testid="match-emblem"
                      data-slug={e.slug}
                      onDragOver={(ev) => ev.preventDefault()}
                      onDrop={(ev) => {
                        ev.preventDefault();
                        const s = ev.dataTransfer.getData('text/plain');
                        if (s) tryMatch(s, e.slug);
                      }}
                      onClick={() =>
                        !ok && (sel ? tryMatch(sel, e.slug) : setMsg('Pick a name first.'))
                      }
                      style={
                        ok
                          ? { background: 'var(--lw-good-bg)', borderColor: 'var(--lw-good)' }
                          : undefined
                      }
                    >
                      {ok && <span aria-hidden>{'✓ '}</span>}
                      {e.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="lw-muted mt-3 min-h-6" role="status">
            {msg}
          </p>
          {done.length === round.names.length && (
            <DoneCard
              realm={realm}
              run={run}
              title={realm === 'sacred' ? 'Beautifully matched' : 'ALL MATCHED!'}
              body={`You matched all ${done.length}. Want a new set?`}
              again={restart}
            />
          )}
        </>
      )}
    </GameShell>
  );
}
