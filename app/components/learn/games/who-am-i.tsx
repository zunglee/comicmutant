/** Who Am I?: a riddle built from three facts (names hidden), guess among four figures. */
import { useMemo, useState } from 'react';
import { riddles, rng } from './logic';
import { useRefocus } from './shared';
import type { GameProps } from './types';
import { DoneCard, GameShell, MORE_ARRIVING, Note, useSeed } from './ui';

export default function WhoAmI({ figures, onExit, realm = 'sacred' }: GameProps) {
  const [seed, again] = useSeed();
  const rounds = useMemo(() => (seed === null ? [] : riddles(figures, rng(seed))), [seed, figures]);
  const [r, setR] = useState(0);
  const [clues, setClues] = useState(1);
  const [wrong, setWrong] = useState<string[]>([]);
  const [got, setGot] = useState<boolean>(false);
  const [score, setScore] = useState(0);
  const [run, setRun] = useState(0);
  const cur = rounds[r];
  const head = useRefocus<HTMLParagraphElement>(r); // a new riddle takes focus from the Next button
  const finished = rounds.length > 0 && r >= rounds.length;

  const restart = () => {
    setR(0);
    setClues(1);
    setWrong([]);
    setGot(false);
    setScore(0);
    again();
  };
  const guess = (slug: string) => {
    if (!cur || got || wrong.includes(slug)) return;
    if (slug === cur.answer) {
      setGot(true);
      if (wrong.length === 0) setScore((s) => s + 1);
    } else {
      setWrong((w) => [...w, slug]);
      setClues((c) => Math.min(3, c + 1));
    }
  };
  const advance = () => {
    if (r + 1 >= rounds.length) setRun((x) => x + 1);
    setR((x) => x + 1);
    setClues(1);
    setWrong([]);
    setGot(false);
  };
  const name = cur?.options.find((o) => o.slug === cur.answer)?.name;

  return (
    <GameShell
      realm={realm}
      title="Who Am I?"
      hint="Read the clues, then guess who it is. A wrong guess just gives you another clue."
      onExit={onExit}
      testId="game-whoami"
    >
      {seed !== null && rounds.length === 0 ? (
        <Note>{MORE_ARRIVING}</Note>
      ) : finished ? (
        <DoneCard
          realm={realm}
          run={run}
          title="What a good detective"
          body={`You solved ${score} of ${rounds.length} on the first try. Try some new riddles?`}
          again={restart}
        />
      ) : cur ? (
        <div className="lw-card p-5">
          <p ref={head} tabIndex={-1} className="lw-muted mb-2 text-sm outline-none">
            Riddle {r + 1} of {rounds.length}
          </p>
          <ol className="mb-4 grid gap-2" aria-label="Clues">
            {cur.clues.slice(0, got ? 3 : clues).map((c, i) => (
              <li key={c} className="text-xl leading-snug" data-testid="clue">
                <span className="lw-muted">Clue {i + 1}: </span>
                {c}
              </li>
            ))}
          </ol>
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Who could it be?">
            {cur.options.map((o) => {
              const bad = wrong.includes(o.slug);
              const ok = got && o.slug === cur.answer;
              return (
                <li key={o.slug}>
                  <button
                    type="button"
                    className="lw-btn w-full"
                    aria-disabled={bad || (got && !ok) || undefined}
                    onClick={() => guess(o.slug)}
                    data-testid="guess"
                    style={
                      ok
                        ? { background: 'var(--lw-good-bg)', borderColor: 'var(--lw-good)' }
                        : undefined
                    }
                  >
                    {ok && <span aria-hidden>{'✓ '}</span>}
                    {o.name}
                    {o.tag && <span className="lw-muted text-sm"> ({o.tag})</span>}
                    {bad && <span className="text-sm"> (not this one)</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 min-h-6 text-lg" role="status">
            {got
              ? `Yes! It is ${name}.`
              : wrong.length
                ? 'Not this one. Here is another clue.'
                : ''}
          </p>
          {got && (
            <div className="mt-2 flex justify-end">
              <button type="button" className="lw-btn" data-primary onClick={advance}>
                {r + 1 >= rounds.length ? 'Finish' : 'Next riddle'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <Note>Thinking up riddles{'…'}</Note>
      )}
    </GameShell>
  );
}
