/**
 * MiniQuiz: a private, client-side self-check. Warm feedback with the `why`, no public scores,
 * petals (Sacred) or a comic burst (comic) at the end, retry any time.
 */
import { m } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuizItem } from '~/lib/schema';
import type { Realm } from './contract';
import { shuffleQuiz } from './games/logic';
import {
  Celebrate,
  LearnStyles,
  rootProps,
  useDur,
  useFocusEffect,
  useRefocus,
} from './games/shared';

export interface MiniQuizProps {
  items: readonly QuizItem[];
  realm: Realm;
  kid?: boolean;
  title?: string;
}

const RIGHT = {
  sacred: ['Lovely, you knew it!', 'Yes, well done.', 'That is right, beautifully done.'],
  comic: ['POW! Nailed it!', 'BAM! Right!', 'ZAP! You knew it!'],
};
const MISS = {
  sacred: ['Good try. Here is the story behind it.', 'Not quite, and now you know.'],
  comic: ['So close! Here is the scoop.', 'Whiff! Now you know.'],
};

export function MiniQuiz({ items, realm, kid = false, title }: MiniQuizProps) {
  const { dur, ease } = useDur(realm);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(0);
  const [finished, setFinished] = useState(false);
  const next = useRef<HTMLButtonElement>(null);
  // Options are shuffled per item (seeded by the item, so SSR and the client agree); `answer` follows.
  const view = useMemo(() => items.map((it, k) => ({ ...it, ...shuffleQuiz(it, k) })), [items]);
  const q = view[i];
  const qHead = useRefocus<HTMLParagraphElement>(`${i}-${finished}`);
  const doneHead = useRef<HTMLHeadingElement>(null);
  useFocusEffect(() => {
    if (finished) doneHead.current?.focus({ preventScroll: true });
  }, [finished]);

  useEffect(() => {
    if (pick !== null) next.current?.focus({ preventScroll: true });
  }, [pick]);

  if (!q) return null;
  const choose = (k: number) => {
    if (pick !== null) return;
    setPick(k);
    if (k === q.answer) setScore((s) => s + 1);
  };
  const advance = () => {
    if (i + 1 >= items.length) {
      setFinished(true);
      setDone((d) => d + 1);
    } else {
      setI(i + 1);
      setPick(null);
    }
  };
  const retry = () => {
    setI(0);
    setPick(null);
    setScore(0);
    setFinished(false);
  };
  const right = pick === q.answer;
  const line = (xs: string[]) => xs[(i + score) % xs.length] as string;
  const size = kid ? 'text-xl' : 'text-lg';

  return (
    <section
      {...rootProps(realm)}
      aria-label={title ?? 'Quick quiz'}
      className="lw relative mx-auto w-full max-w-xl"
      data-testid="mini-quiz"
      onKeyDown={(e) => {
        if (finished) return;
        const k = Number(e.key);
        if (k >= 1 && k <= 4) choose(k - 1);
      }}
    >
      <LearnStyles />
      <div className="lw-card relative overflow-hidden p-5">
        <Celebrate realm={realm} run={finished ? done : 0} />
        {finished ? (
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur(0.4), ease }}
            className="flex flex-col items-center gap-3 py-4 text-center"
            data-testid="quiz-done"
          >
            <h3 ref={doneHead} tabIndex={-1} className="lw-title text-3xl outline-none">
              {score === items.length
                ? realm === 'sacred'
                  ? 'You knew them all!'
                  : 'PERFECT!'
                : 'Well done for trying!'}
            </h3>
            <p className="text-lg" role="status">
              You found {score} of {items.length}. This is just for you, nobody else sees it.
            </p>
            <button type="button" className="lw-btn" data-primary onClick={retry}>
              Try again
            </button>
          </m.div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="lw-title text-xl">{title ?? 'Quick quiz'}</h3>
              <span className="lw-muted text-sm">
                Question {i + 1} of {items.length}
              </span>
            </div>
            <p
              ref={qHead}
              tabIndex={-1}
              className={`${size} mb-4 leading-snug outline-none`}
              id={`mq-q-${i}`}
            >
              {q.q}
            </p>
            <ul className="grid gap-2" aria-labelledby={`mq-q-${i}`}>
              {q.options.map((o, k) => {
                const isAns = pick !== null && k === q.answer;
                const isMine = pick === k;
                return (
                  <li key={o}>
                    <button
                      type="button"
                      className="lw-btn w-full justify-start text-left"
                      aria-disabled={pick !== null}
                      aria-pressed={isMine}
                      data-on={isAns || undefined}
                      onClick={() => choose(k)}
                      style={
                        isAns
                          ? { background: 'var(--lw-good-bg)', borderColor: 'var(--lw-good)' }
                          : undefined
                      }
                    >
                      <span className="lw-muted font-mono text-sm" aria-hidden>
                        {k + 1}
                      </span>
                      <span className={`${size} flex-1`}>{o}</span>
                      {isAns && (
                        <span className="text-sm" style={{ color: 'var(--lw-good)' }}>
                          <span aria-hidden>{'✓ '}</span>Right answer
                        </span>
                      )}
                      {isMine && !isAns && <span className="text-sm">Your pick</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {pick !== null && (
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: dur(0.3), ease }}
                className="mt-4 rounded-[var(--lw-r)] p-4"
                style={{ background: right ? 'var(--lw-good-bg)' : 'var(--lw-warm)' }}
                role="status"
                data-testid="quiz-feedback"
              >
                <p className="lw-title text-xl">{right ? line(RIGHT[realm]) : line(MISS[realm])}</p>
                <p className={`${size} mt-1 leading-snug`}>{q.why}</p>
              </m.div>
            )}
            {pick !== null && (
              <div className="mt-3 flex justify-end">
                <button type="button" ref={next} className="lw-btn" data-primary onClick={advance}>
                  {i + 1 >= items.length ? 'See how I did' : 'Next question'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
