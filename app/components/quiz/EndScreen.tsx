/** The finish: score count-up, grid, rank / held note, PB confetti, share, claim, next steps. */
import { m } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useAnimate } from '~/lib/fx';
import type { QuizMode, QuizSummary } from '~/lib/quiz-contract';
import { fmt, istDayLabel, joinHref, loginHref, type PlayTarget, shareUrl } from './daily';
import { Confetti } from './Fx';
import { type CellKind, parseGrid } from './grid';
import { IconCheck, IconClock, IconCross } from './qicons';
import { SharePanel } from './ShareCard';

export function shareText(label: string, s: QuizSummary, url: string): string {
  if (s.blind) {
    return [
      `Fact Frenzy · ${label}`,
      `Blind practice: locked in ${s.total} answers, no score.`,
      `Play it: ${url}`,
    ].join('\n');
  }
  return [
    `Fact Frenzy · ${label}`,
    s.grid,
    `${s.correct}/${s.total} · ${fmt(s.score)} pts · best streak ${s.bestStreak}${s.held ? ' · pending a check' : ''}`,
    `Beat me: ${url}`,
  ].join('\n');
}

/** Counts the number up by writing the text node directly: no React render per frame. */
function CountText({ value, ms = 1100 }: { value: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anim = useAnimate();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!anim) {
      el.textContent = fmt(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, anim]);
  return <span ref={ref}>{fmt(value)}</span>;
}

function Cell({ kind, i }: { kind: CellKind; i: number }) {
  const label = kind === 'ok' ? 'Right' : kind === 'bad' ? 'Wrong' : 'Timed out';
  return (
    <li
      className="qz-pop grid size-8 place-items-center rounded-md border-[3px] border-line text-ink sm:size-9"
      style={{
        background:
          kind === 'ok' ? 'var(--qz-ok)' : kind === 'bad' ? 'var(--qz-bad)' : 'var(--qz-warn)',
        animationDelay: `${0.5 + i * 0.07}s`,
      }}
    >
      <span className="sr-only">{`Question ${i + 1}: ${label}`}</span>
      {kind === 'ok' ? (
        <IconCheck className="size-4" />
      ) : kind === 'bad' ? (
        <IconCross className="size-4" />
      ) : (
        <IconClock className="size-4" />
      )}
    </li>
  );
}

export function EndScreen({
  summary,
  label,
  mode,
  signedIn,
  unrankedWhy,
  lockedCount,
  target,
  onPlayAgain,
  pendingSaved,
}: {
  summary: QuizSummary;
  label: string;
  mode: QuizMode;
  signedIn: boolean;
  unrankedWhy?: string;
  /** Answers kept secret until midnight IST. */
  lockedCount: number;
  target: PlayTarget;
  onPlayAgain: () => void;
  pendingSaved: boolean;
}) {
  const animate = useAnimate();
  const head = useRef<HTMLHeadingElement>(null);
  const cells = parseGrid(summary.grid);
  const url = typeof window === 'undefined' ? '' : shareUrl(target, window.location.origin);
  const text = shareText(label, summary, url);

  useEffect(() => {
    head.current?.focus({ preventScroll: false });
  }, []);

  const blind = summary.blind;
  // A held run is waiting for a moderator: no fireworks, no "personal best" until it is cleared.
  const celebrate = summary.personalBest && !blind && !summary.held;
  const verdict = blind
    ? 'LOCKED IN!'
    : summary.correct === summary.total
      ? 'FLAWLESS!'
      : summary.correct >= summary.total * 0.7
        ? 'SUPER SMART!'
        : summary.correct >= summary.total * 0.4
          ? 'NOT BAD, HERO!'
          : 'ORIGIN STORY!';

  return (
    <div className="space-y-5">
      {celebrate && <Confetti />}
      <m.section
        aria-labelledby="qz-end"
        className="panel halftone relative overflow-hidden p-5 text-center sm:p-8"
        initial={animate ? { scale: 0.6, rotate: -4, y: 40 } : false}
        animate={{ scale: 1, rotate: 0, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16 }}
      >
        <p className="kicker">{label}</p>
        <h2
          id="qz-end"
          ref={head}
          tabIndex={-1}
          className="h-display ink-text -rotate-2 text-5xl text-c1-text outline-none sm:text-7xl"
        >
          {verdict}
        </h2>
        {celebrate && (
          <m.p
            className="burst mx-auto my-3 grid size-28 -rotate-6 place-items-center bg-c3 px-4 text-center font-display text-ink text-xl leading-none"
            initial={animate ? { scale: 0, rotate: 30 } : false}
            animate={{ scale: 1, rotate: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 11, delay: 0.7 }}
          >
            NEW
            <br />
            PERSONAL
            <br />
            BEST!
          </m.p>
        )}
        {blind ? (
          <p className="mt-3 font-display text-4xl leading-tight sm:text-6xl">
            Blind practice: no score
          </p>
        ) : (
          <>
            <p className="mt-2 font-display text-7xl leading-none sm:text-8xl" aria-hidden>
              <CountText value={summary.score} />
            </p>
            <p className="sr-only">
              Final score {summary.score}. {summary.correct} of {summary.total} right.
            </p>
            <p className="font-head text-muted text-sm uppercase tracking-widest">points</p>
          </>
        )}

        {!blind && (
          <>
            <ul
              className="mx-auto mt-4 flex max-w-sm flex-wrap justify-center gap-1.5"
              aria-label="Your answers"
            >
              {cells.map((k, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed-order cells.
                <Cell key={i} kind={k} i={i} />
              ))}
            </ul>

            <dl className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-3">
              {[
                ['Right', `${summary.correct}/${summary.total}`],
                ['Best streak', String(summary.bestStreak)],
                ['New facts', signedIn && !summary.held ? String(summary.newFacts) : '-'],
              ].map(([k, v]) => (
                <div key={k} className="panel bg-bg! p-2">
                  <dt className="font-head text-[0.7rem] text-muted uppercase tracking-wider">
                    {k}
                  </dt>
                  <dd className="font-display text-3xl leading-none">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="mx-auto mt-5 max-w-md space-y-3 text-sm" aria-live="polite">
          {blind ? (
            mode === 'daily' ? (
              <p className="bubble text-left">
                No score and no answers for a blind run. Tomorrow,{' '}
                <Link to="/quiz#yesterday" className="underline">
                  Yesterday's answers
                </Link>{' '}
                shows the right answers.
              </p>
            ) : (
              <p className="bubble text-left">
                {unrankedWhy ?? 'This run was blind practice: no score and no answers are shown.'}
              </p>
            )
          ) : summary.ranked && summary.held ? (
            <p className="bubble text-left">
              Held for a quick check. A moderator looks at very fast runs before they reach a board,
              so your score is safe and will show once it is cleared.
            </p>
          ) : summary.ranked ? (
            summary.rank !== null &&
            summary.board && (
              <p className="bubble text-left">
                {summary.nameWithheld ? (
                  <>
                    You're <strong>#{summary.rank}</strong> on {summary.board}. Your name shows
                    after a quick check by a mod.
                  </>
                ) : (
                  <>
                    You are <strong>#{summary.rank}</strong> on {summary.board}.
                  </>
                )}
              </p>
            )
          ) : signedIn ? (
            <p className="bubble text-left">
              This one was just for fun{unrankedWhy ? `: ${unrankedWhy}` : '.'}
              {summary.newFacts > 0
                ? ` ${summary.newFacts} new ${summary.newFacts === 1 ? 'fact' : 'facts'} added to your Facts known.`
                : ''}
            </p>
          ) : summary.claimable ? null : (
            <p className="bubble text-left">
              Guest games from earlier than 30 minutes ago can't be saved. Join to keep your next
              one.
            </p>
          )}
          {lockedCount > 0 && !blind && (
            <p className="bubble -rotate-1 text-left">
              {lockedCount === 1 ? 'One answer is' : `${lockedCount} answers are`} locked until
              midnight IST. Come back tomorrow and open{' '}
              <Link to="/quiz#yesterday" className="underline">
                Yesterday's answers
              </Link>
              .
            </p>
          )}
        </div>
      </m.section>

      {!signedIn && blind && (
        <section aria-labelledby="qz-join" className="panel-c1 relative p-4 sm:p-5">
          <h3 id="qz-join" className="h-head text-xl">
            {mode === 'daily' ? 'Join and play the ranked daily' : 'Join to play for the boards'}
          </h3>
          <p className="mb-3 text-sm">
            {mode === 'daily'
              ? 'A free nickname lets your first try of the day compete for the daily board.'
              : 'A free nickname lets your games compete for the boards.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/join?next=%2Fquiz" className="btn btn-c3">
              Join free
            </Link>
            <Link to="/login?next=%2Fquiz" className="btn">
              I already have a nickname
            </Link>
          </div>
        </section>
      )}
      {!signedIn && !blind && summary.claimable && (
        <section aria-labelledby="qz-join" className="panel-c1 relative p-4 sm:p-5">
          <h3 id="qz-join" className="h-head text-xl">
            Join to save this score
          </h3>
          <p className="mb-3 text-sm">
            You played as a guest. Join free within 30 minutes and this game is saved to your
            account and the boards.
            {!pendingSaved && ' (Your browser is blocking storage, so finish joining in this tab.)'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={joinHref} className="btn btn-c3">
              Join and save it
            </Link>
            <Link to={loginHref} className="btn">
              I already have a nickname
            </Link>
          </div>
        </section>
      )}

      <SharePanel label={label} dateLabel={istDayLabel()} summary={summary} text={text} url={url} />

      <nav aria-label="What next" className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-c1" onClick={onPlayAgain}>
          {mode === 'daily' ? 'Practice it again' : 'Play again'}
        </button>
        <Link to="/quiz#universes" className="btn">
          Other universe
        </Link>
        <Link to="/quiz/leaders" className="btn">
          Leaderboard
        </Link>
        {signedIn && (
          <Link to="/quiz/me" className="btn">
            My stats
          </Link>
        )}
      </nav>
    </div>
  );
}
