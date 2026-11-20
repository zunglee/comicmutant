/**
 * One question: character-tinted header (name, universe, difficulty), the question, four big
 * options. Slams in and the options stagger (CSS keyframes: no per-question animation objects to
 * build, which keeps the transition cheap). Answers appear only from the reveal.
 */
import { forwardRef } from 'react';
import { useAnimate } from '~/lib/fx';
import type { QuizQuestionView, QuizReveal } from '~/lib/quiz-contract';
import { UNIVERSE_LABEL } from '~/lib/taxonomy';
import { scopeVars } from '~/lib/theme/compute';
import { DifficultyPips } from './Fx';
import { IconCheck, IconCross } from './qicons';

export type Palette = { c1: string; c2: string; c3: string };
const LETTERS = ['A', 'B', 'C', 'D'] as const;

export const QuestionCard = forwardRef<
  HTMLHeadingElement,
  {
    q: QuizQuestionView;
    palette?: Palette;
    /** Option index the player locked in; -1 = clock ran out; null = still choosing. */
    pick: number | null;
    reveal: QuizReveal | null;
    onPick: (i: 0 | 1 | 2 | 3) => void;
    total: number;
    children?: React.ReactNode;
  }
>(function QuestionCard({ q, palette, pick, reveal, onPick, total, children }, headingRef) {
  const animate = useAnimate();
  const locked = pick !== null;
  const wrong = reveal && reveal.correct === false;
  const style = palette ? (scopeVars(palette) as React.CSSProperties) : undefined;
  const state = (i: number) => {
    if (reveal?.blind) return i === pick ? 'picked' : 'dim';
    if (reveal) {
      // A locked daily answer lights nothing: the right option stays secret until midnight IST.
      if (reveal.answer !== null && i === reveal.answer) return 'right';
      if (i === pick && reveal.correct === false) return 'wrong';
      return 'dim';
    }
    if (i === pick) return 'picked';
    return locked ? 'dim' : 'idle';
  };
  return (
    <section
      aria-labelledby={`qz-q-${q.index}`}
      className={`panel relative overflow-hidden ${animate ? 'qz-slam' : ''} ${wrong ? 'qz-shake' : ''}`}
      style={style}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-line border-b-[3px] bg-c1 px-3 py-2 text-on-c1">
        <span className="font-display text-xl leading-none tracking-wide">{q.character.name}</span>
        <span className="round border-2 border-line bg-c2 px-2 py-0.5 font-head text-[0.7rem] text-on-c2 uppercase tracking-wider">
          {UNIVERSE_LABEL[q.character.universe]}
        </span>
        <span className="ml-auto flex items-center gap-3 font-head text-xs uppercase tracking-wider">
          <span>{q.topic}</span>
          <DifficultyPips level={q.difficulty} />
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <h2
          id={`qz-q-${q.index}`}
          ref={headingRef}
          tabIndex={-1}
          className="mb-3 font-head text-xl leading-snug outline-none sm:mb-4 sm:text-2xl"
        >
          <span className="sr-only">
            Question {q.index + 1} of {total}:{' '}
          </span>
          {q.q}
        </h2>
        <ul className="grid list-none gap-3 sm:grid-cols-2">
          {q.options.map((text, i) => {
            const st = state(i);
            return (
              <li
                key={`${q.index}-${text}`}
                className={`flex ${animate ? 'qz-slide' : ''}`}
                style={{ ['--i' as string]: i }}
              >
                <button
                  type="button"
                  className="qz-opt"
                  data-state={st}
                  disabled={locked}
                  aria-pressed={locked ? i === pick : undefined}
                  onClick={() => onPick(i as 0 | 1 | 2 | 3)}
                >
                  <span className="qz-key" aria-hidden>
                    {LETTERS[i]}
                  </span>
                  <span>
                    <span className="sr-only">Option {LETTERS[i]}: </span>
                    {text}
                    {reveal && st === 'right' && (
                      <span className="sr-only"> (the right answer)</span>
                    )}
                    {reveal && st === 'wrong' && (
                      <span className="sr-only"> (your answer, wrong)</span>
                    )}
                  </span>
                  {reveal && st === 'right' && (
                    <span className="grid size-7 place-items-center round border-2 border-line bg-paper">
                      <IconCheck className="size-4" />
                    </span>
                  )}
                  {reveal && st === 'wrong' && (
                    <span className="grid size-7 place-items-center round border-2 border-line bg-paper">
                      <IconCross className="size-4" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {children}
      </div>
    </section>
  );
});
