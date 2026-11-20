import { m } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';

export interface TriviaItem {
  id: string;
  q: string;
  options: string[];
  answer: number;
  why: string;
  slug: string;
  name: string;
}

const ROUND = 5;

/** Self-check only: local score, nothing stored or ranked. Questions come from the heroes' own quiz items. */
export function DesiTrivia({ items }: { items: TriviaItem[] }) {
  const [round, setRound] = useState(0);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const rounds = Math.max(1, Math.floor(items.length / ROUND));
  const start = (round % rounds) * ROUND;
  const set = items.slice(start, start + ROUND);
  const q = set[i];
  if (items.length === 0) return null;
  const done = i >= set.length;
  return (
    <section aria-labelledby="trv-h" className="panel halftone space-y-5 p-6 sm:p-8">
      <p className="kicker">Self-check</p>
      <h2 id="trv-h" className="h-display text-4xl sm:text-5xl">
        Desi trivia
      </h2>
      <div aria-live="polite">
        {done || !q ? (
          <div className="space-y-4">
            <p className="h-display text-6xl text-c1-text-card">
              {score}/{set.length}
            </p>
            <p>
              {score === set.length ? 'Perfect round.' : 'Read a profile, then try a new round.'}
            </p>
            <button
              type="button"
              className="btn btn-c1"
              onClick={() => {
                setRound((r) => r + 1);
                setI(0);
                setPick(null);
                setScore(0);
              }}
            >
              New round
            </button>
          </div>
        ) : (
          <fieldset className="space-y-3">
            <legend className="h-head mb-3 text-xl">
              Q{i + 1} of {set.length}. {q.q}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((o, k) => {
                const state =
                  pick === null
                    ? ''
                    : k === q.answer
                      ? 'bg-(--qz-ok)! text-(--print-ink)!'
                      : k === pick
                        ? 'bg-(--qz-bad)! text-(--print-ink)!'
                        : 'opacity-60';
                return (
                  <m.button
                    key={o}
                    type="button"
                    className={`btn justify-start text-left normal-case ${state}`}
                    disabled={pick !== null}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setPick(k);
                      if (k === q.answer) setScore((s) => s + 1);
                    }}
                  >
                    {o}
                  </m.button>
                );
              })}
            </div>
            {pick !== null && (
              <div className="space-y-3">
                <p className="bubble">
                  {pick === q.answer ? 'Correct. ' : 'Not quite. '}
                  {q.why}{' '}
                  <Link to={`/c/${q.slug}`} className="underline">
                    More on {q.name}
                  </Link>
                </p>
                <button
                  type="button"
                  className="btn btn-c1"
                  onClick={() => {
                    setI((n) => n + 1);
                    setPick(null);
                  }}
                >
                  {i + 1 >= set.length ? 'See my score' : 'Next question'}
                </button>
              </div>
            )}
          </fieldset>
        )}
      </div>
    </section>
  );
}
