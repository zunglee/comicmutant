/**
 * Fact Frenzy play screen. State machine: ready → loading → asking → sending → reveal → … → end.
 * The server holds every answer; this file only ever shows one that came back in a reveal.
 */
import { AnimatePresence, m } from 'motion/react';
import { startTransition, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAnimate, useReducedMotion } from '~/lib/fx';
import type {
  OpenDaily,
  QuizErrorCode,
  QuizMode,
  QuizQuestionView,
  QuizReveal,
  QuizStartBody,
  QuizStartReply,
  QuizSummary,
} from '~/lib/quiz-contract';
import type { PublishedUniverse } from '~/lib/taxonomy';
import { scopeVars } from '~/lib/theme/compute';
import { nextQuestion, sendAnswer, startGame } from './api';
import { fmt, hhmm, istDayLabel, msToIstMidnight, resumeLine } from './daily';
import { EndScreen } from './EndScreen';
import {
  ComboBanner,
  LOCK_WORDS,
  PointsFly,
  RIGHT_WORDS,
  ScoreCounter,
  StreakMeter,
  TIME_WORDS,
  VerdictBurst,
  WRONG_WORDS,
} from './Fx';
import { keepPending, readPending } from './pending';
import { QuestionCard } from './QuestionCard';
import { IconBolt, IconCheck, IconCross, IconLock } from './qicons';
import { ReportFact } from './ReportFact';
import { Timer } from './Timer';

type Cell = 'ok' | 'bad' | 'time' | 'lock';
type Phase = 'ready' | 'loading' | 'asking' | 'sending' | 'reveal' | 'end';

interface S {
  phase: Phase;
  game: string;
  total: number;
  ranked: boolean;
  unrankedWhy?: string;
  q: QuizQuestionView | null;
  pick: number | null;
  reveal: QuizReveal | null;
  more: boolean;
  /** Answers kept secret until midnight IST (today's daily). */
  lockedCount: number;
  /** Blind daily practice: results stay secret until midnight IST. */
  blind: boolean;
  /** This game was picked up again (an open daily): show the welcome-back note. */
  resumed: boolean;
  /** Fetching the next question (POST /api/quiz/next) after the player pressed Next. */
  fetching: boolean;
  summary: QuizSummary | null;
  results: Cell[];
  score: number;
  streak: number;
  /** Shown in the ready screen (start failed) or under the card (answer failed). */
  err: string;
  /** The server's reason code for `err` (absent for a dropped connection). */
  code: QuizErrorCode | null;
}

const FRESH: S = {
  phase: 'ready',
  game: '',
  total: 10,
  ranked: false,
  q: null,
  pick: null,
  reveal: null,
  more: false,
  lockedCount: 0,
  blind: false,
  resumed: false,
  fetching: false,
  summary: null,
  results: [],
  score: 0,
  streak: 0,
  err: '',
  code: null,
};

type A =
  | { type: 'loading' }
  | { type: 'startFailed'; error: string; code: QuizErrorCode | null }
  | { type: 'started'; r: Extract<QuizStartReply, { ok: true }> }
  | { type: 'finishedOnResume'; summary: QuizSummary }
  | { type: 'pick'; choice: number }
  | { type: 'answerFailed'; error: string; code: QuizErrorCode | null }
  | { type: 'resend' }
  | {
      type: 'revealed';
      reveal: QuizReveal;
      more: boolean;
      summary: QuizSummary | null;
    }
  | { type: 'fetchNext' }
  | { type: 'nextFailed'; error: string; code: QuizErrorCode | null }
  | { type: 'advance'; q: QuizQuestionView }
  | { type: 'finish' };

function reduce(s: S, a: A): S {
  switch (a.type) {
    case 'loading':
      return { ...FRESH, phase: 'loading' };
    case 'startFailed':
      return { ...FRESH, err: a.error, code: a.code };
    case 'finishedOnResume':
      return { ...FRESH, phase: 'end', summary: a.summary };
    case 'started': {
      // A resumed daily comes back with where it stands: put the HUD back as it was.
      const rs = a.r.resumed;
      const results = rs ? parseResume(rs.grid) : [];
      return {
        ...FRESH,
        phase: 'asking',
        game: a.r.game,
        total: a.r.total,
        ranked: a.r.ranked,
        unrankedWhy: a.r.unrankedWhy,
        q: a.r.question ?? null,
        score: rs?.score ?? 0,
        streak: rs?.streak ?? 0,
        results,
        blind: results.includes('lock'),
        resumed: !!rs,
      };
    }
    case 'pick':
      return { ...s, phase: 'sending', pick: a.choice, err: '', resumed: false };
    case 'answerFailed':
      return { ...s, err: a.error, code: a.code };
    case 'resend':
      return { ...s, err: '', code: null };
    case 'revealed': {
      const cell: Cell = a.reveal.blind
        ? a.reveal.timedOut
          ? 'time'
          : 'lock'
        : a.reveal.correct
          ? 'ok'
          : a.reveal.timedOut
            ? 'time'
            : 'bad';
      return {
        ...s,
        phase: 'reveal',
        reveal: a.reveal,
        more: a.more,
        fetching: false,
        summary: a.summary,
        results: [...s.results, cell],
        lockedCount: s.lockedCount + (a.reveal.locked ? 1 : 0),
        blind: s.blind || a.reveal.blind,
        score: a.reveal.score,
        streak: a.reveal.streak,
        err: '',
      };
    }
    case 'fetchNext':
      return { ...s, fetching: true, err: '' };
    case 'nextFailed':
      return { ...s, fetching: false, err: a.error, code: a.code };
    case 'advance':
      return {
        ...s,
        phase: 'asking',
        q: a.q,
        pick: null,
        reveal: null,
        fetching: false,
        err: '',
      };
    case 'finish':
      return { ...s, phase: 'end' };
  }
}

/** The server's progress grid → cells (✓ right, ✗ wrong, ⏱ timed out, • sealed in a blind daily). */
function parseResume(grid: string): Cell[] {
  const map: Record<string, Cell> = { '✓': 'ok', '✗': 'bad', '⏱': 'time', '•': 'lock' };
  return (grid.match(/[✓✗⏱•]/gu) ?? []).map((c) => map[c] ?? 'bad');
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export interface QuizGameProps {
  mode: QuizMode;
  universe?: PublishedUniverse;
  character?: string;
  /** "Daily · Sun 1 Nov", "Marvel", "Spider-Man". */
  label: string;
  heading: string;
  signedIn: boolean;
  me: string | null;
  palettes: Record<string, [string, string, string]>;
  /** The tint for the ready screen (character mode). */
  tint?: [string, string, string];
  /** The viewer's open daily (daily mode): the intro offers Resume instead of Let's go. */
  openDaily?: OpenDaily | null;
  /** Daily starts left today (null = unknown): 0 means the intro offers no start at all. */
  startsLeft?: number | null;
}

export default function QuizGame(p: QuizGameProps) {
  const [s, dispatch] = useReducer(reduce, FRESH);
  const animate = useAnimate();
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  // Announcements go to a tiny component of their own: a screen-reader message must not re-render
  // the whole game (it did, on top of the reveal's own render).
  const sayBus = useRef<((t: string) => void) | null>(null);
  const setSay = useCallback((t: string) => sayBus.current?.(t), []);
  const [sure, setSure] = useState(false);
  const quitBtn = useRef<HTMLButtonElement>(null);
  const sureTimer = useRef(0);
  const [fly, setFly] = useState<{
    id: number;
    points: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [pendingSaved, setPendingSaved] = useState(true);
  const lock = useRef(false);
  const head = useRef<HTMLHeadingElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const panelEl = useRef<HTMLDivElement>(null);
  const barEl = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const scoreEl = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  // Build the Intl formatters while the player reads the ready screen: their first use costs
  // tens of milliseconds on a phone, which would otherwise land inside the first transition.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number };
    const warm = () => {
      fmt(0);
      istDayLabel();
      for (const f of ['1em Bangers', '1em "Russo One"', '1em "Chakra Petch"'])
        void document.fonts?.load(f);
    };
    if (w.requestIdleCallback) w.requestIdleCallback(warm);
    else window.setTimeout(warm, 300);
  }, []);

  const body: QuizStartBody = {
    mode: p.mode,
    ...(p.mode === 'universe' ? { universe: p.universe } : {}),
    ...(p.mode === 'character' ? { character: p.character } : {}),
  };
  const bodyKey = JSON.stringify(body);

  // biome-ignore lint/correctness/useExhaustiveDependencies: body is rebuilt from bodyKey.
  const start = useCallback(async () => {
    lock.current = false;
    setSay('Loading your questions');
    dispatch({ type: 'loading' });
    const r = await startGame(body);
    if (r.ok && !r.question && r.summary) {
      // A resumed daily whose last clock ran out: it is already over, so go straight to the end.
      const summary = r.summary;
      startTransition(() => dispatch({ type: 'finishedOnResume', summary }));
      setSay('Your daily is finished.');
    } else if (r.ok && r.question) {
      startTransition(() => dispatch({ type: 'started', r }));
      setSay('');
    } else {
      const error = r.ok ? 'That daily could not be resumed. Please try again.' : r.error;
      dispatch({ type: 'startFailed', error, code: r.ok ? null : (r.code ?? null) });
      setSay(error);
    }
  }, [bodyKey]);

  const q = s.q;
  const sendPick = useCallback(
    async (choice: number) => {
      if (!q) return;
      const body = { game: s.game, index: q.index, choice: choice as -1 | 0 | 1 | 2 | 3 };
      let r = await sendAnswer(body);
      // One quiet retry on a dropped connection. The server returns the stored reveal when an
      // identical answer is sent again, so a reply that was only lost on the way back is safe.
      if (!r.ok && 'network' in r && r.network) {
        await new Promise((res) => window.setTimeout(res, 1200));
        r = await sendAnswer(body);
      }
      if (!r.ok) {
        dispatch({ type: 'answerFailed', error: r.error, code: r.code ?? null });
        setSay(r.error);
        return;
      }
      // A transition: React renders the (large) reveal in slices instead of one long task.
      startTransition(() =>
        dispatch({ type: 'revealed', reveal: r.reveal, more: r.more, summary: r.summary }),
      );
      const rr = r.reveal;
      const letter = rr.answer === null ? '' : ('ABCD'[rr.answer] ?? '');
      const text = rr.answer === null ? '' : (q.options[rr.answer] ?? '');
      setSay(
        rr.blind
          ? `${rr.timedOut ? "Time's up." : 'Locked in!'} Blind run: no result is shown.`
          : rr.correct
            ? `Correct! Plus ${rr.points} points. Streak ${rr.streak}. Score ${rr.score}.`
            : `${rr.timedOut ? "Time's up." : 'Not quite.'} ${
                rr.locked
                  ? 'The answer unlocks at midnight India time. Come back for it!'
                  : `The answer was ${letter}: ${text}.`
              }`,
      );
      const sm = r.summary;
      if (sm && !p.signedIn && sm.claimable) {
        keepPending({
          game: s.game,
          mode: p.mode,
          label: p.label,
          score: sm.score,
          correct: sm.correct,
          total: sm.total,
          at: Date.now(),
        });
        setPendingSaved(readPending()?.game === s.game);
      }
    },
    [q, s.game, p.signedIn, p.mode, p.label, setSay],
  );

  const choose = useCallback(
    (choice: number) => {
      if (lock.current || !q) return;
      lock.current = true;
      dispatch({ type: 'pick', choice });
      // The pressed state renders first; the request is set up in its own task.
      window.setTimeout(() => void sendPick(choice), 0);
    },
    [q, sendPick],
  );
  const retry = () => {
    dispatch({ type: 'resend' });
    if (s.pick !== null) void sendPick(s.pick);
  };
  const advance = useCallback(async () => {
    if (s.phase !== 'reveal' || s.fetching || !q) return;
    if (!s.more) {
      setSay('');
      startTransition(() => dispatch({ type: 'finish' }));
      return;
    }
    // The next question's clock starts when this reply lands, so the player reads at their own pace.
    dispatch({ type: 'fetchNext' });
    setSay('Loading the next question');
    const r = await nextQuestion({ game: s.game, index: q.index + 1 });
    if (!r.ok) {
      dispatch({ type: 'nextFailed', error: r.error, code: r.code ?? null });
      setSay(r.error);
      return;
    }
    lock.current = false;
    setSay('');
    dispatch({ type: 'advance', q: r.question });
  }, [s.phase, s.fetching, s.more, s.game, q, setSay]);

  // Keyboard: 1-4 / A-D pick, Enter continues (a focused button handles its own Enter).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (s.phase === 'asking') {
        const i = '1234'.indexOf(k) >= 0 && k.length === 1 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
        if (i >= 0 && k.length === 1) {
          e.preventDefault();
          choose(i);
        }
      } else if (s.phase === 'reveal' && e.key === 'Enter') {
        if (t && /^(BUTTON|A)$/.test(t.tagName)) return;
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.phase, choose, advance]);

  // Esc backs out of the two-step quit and puts focus back on Quit.
  useEffect(() => {
    if (!sure) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      window.clearTimeout(sureTimer.current);
      setSure(false);
      quitBtn.current?.focus();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [sure]);

  // The site chrome (tab bar, theme dock; the header too on touch screens) steps aside for the
  // whole visit to the game page. It is set once, on mount: flipping it between phases restyles the
  // whole document in the middle of a transition (a 50 ms layout at 4x CPU).
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-in-game', '');
    return () => el.removeAttribute('data-in-game');
  }, []);

  // New question: bring the clock into view and move focus to the question.
  const qIndex = q?.index;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per question.
  useEffect(() => {
    if (s.phase !== 'asking') return;
    // Back to the top of the game, so the clock and the whole new question are in view.
    const top = (wrap.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    head.current?.focus({ preventScroll: true });
  }, [qIndex, s.phase === 'asking']);

  // Reveal: focus Continue, then send the points flying to the score.
  const rv = s.reveal;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per reveal.
  useEffect(() => {
    if (!rv) {
      setFly(null);
      return;
    }
    nextBtn.current?.focus({ preventScroll: true });
    // The Next bar is pinned to the bottom of the screen: scroll just enough that the end of the
    // reveal (why, source, report) sits above it, so the bar never covers what you came to read.
    const id = requestAnimationFrame(() => {
      const pr = panelEl.current?.getBoundingClientRect();
      const br = barEl.current?.getBoundingClientRect();
      if (pr && br && pr.bottom + 10 > br.top) {
        window.scrollBy({ top: pr.bottom + 10 - br.top, behavior: 'instant' });
      }
      if (rv.correct !== true || rv.points <= 0 || reduced) return;
      const c = card.current?.getBoundingClientRect();
      const t = scoreEl.current?.getBoundingClientRect();
      if (!c || !t) return;
      setFly({
        id: (q?.index ?? 0) + 1,
        points: rv.points,
        from: { x: c.left + c.width / 2, y: c.top + Math.min(c.height * 0.4, 260) },
        to: { x: t.left + 24, y: t.top + t.height / 2 },
      });
    });
    return () => cancelAnimationFrame(id);
  }, [rv]);

  const words = rv?.blind
    ? LOCK_WORDS
    : rv?.timedOut
      ? TIME_WORDS
      : rv?.correct
        ? RIGHT_WORDS
        : WRONG_WORDS;
  const word = rv ? (words[hash(`${s.game}${q?.index}`) % words.length] ?? 'POW!') : '';
  const tone = rv ? (rv.blind || rv.timedOut ? 'time' : rv.correct ? 'right' : 'wrong') : 'right';
  const palette = q ? toPalette(p.palettes[q.character.slug]) : undefined;
  const gone = goneKind(s.code);
  const live = !gone && (s.phase === 'asking' || s.phase === 'sending' || s.phase === 'reveal');
  const link = rv?.source && /^https?:\/\//i.test(rv.source) ? rv.source : null;

  return (
    <div ref={wrap} className="mx-auto max-w-3xl px-4 py-4 sm:py-6">
      <LiveSay bus={sayBus} />
      {gone && (s.phase === 'sending' || s.phase === 'reveal') && (
        <GonePanel kind={gone} onDaily={() => void start()} />
      )}

      {live && q && (
        <div
          id="qz-hud"
          ref={hud}
          className="sticky top-[3.6rem] z-30 -mx-4 mb-3 border-line border-b-[3px] bg-bg px-4 py-2 pointer-coarse:top-0 sm:top-[4.2rem]"
        >
          <div className="flex items-center gap-3">
            <Timer
              key={`${s.game}-${q.index}`}
              seconds={q.seconds}
              active={s.phase === 'asking'}
              onExpire={() => choose(-1)}
              onSay={setSay}
            />
            <div ref={scoreEl} className="min-w-0">
              {s.blind ? (
                <p className="font-display text-2xl leading-none">Blind run</p>
              ) : (
                <>
                  <p className="font-head text-[0.65rem] text-muted uppercase tracking-widest">
                    Score
                  </p>
                  <p className="font-display text-3xl leading-none">
                    <ScoreCounter value={s.score} delay={animate ? 950 : 0} />
                  </p>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              {!s.blind && <StreakMeter streak={s.streak} />}
              <button
                ref={quitBtn}
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  if (sure) navigate('/quiz');
                  else {
                    setSure(true);
                    window.clearTimeout(sureTimer.current);
                    sureTimer.current = window.setTimeout(
                      () => setSure(false),
                      p.mode === 'daily' ? 6000 : 3000,
                    );
                  }
                }}
              >
                {sure ? 'Sure?' : 'Quit'}
              </button>
            </div>
          </div>
          {sure && p.mode === 'daily' && (
            <p role="status" className="mt-2 text-xs">
              Your daily stays open: come back to finish it. The clock on this question keeps
              running.
            </p>
          )}
          <div aria-hidden className="mt-2 flex gap-1">
            {Array.from({ length: s.total }, (_, i) => {
              const r = s.results[i];
              const here = i === q.index && !r;
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length progress strip.
                  key={i}
                  className="h-2.5 flex-1 rounded-skin-s border-2 border-line"
                  style={{
                    background: r
                      ? r === 'ok'
                        ? 'var(--qz-ok)'
                        : r === 'bad'
                          ? 'var(--qz-bad)'
                          : r === 'lock'
                            ? 'var(--c3)'
                            : 'var(--qz-warn)'
                      : here
                        ? 'var(--c3)'
                        : 'var(--card)',
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {live && s.resumed && s.phase === 'asking' && (
        <p role="status" className="bubble mb-3 -rotate-1 text-sm">
          <strong>Welcome back!</strong> Your daily picks up here.
        </p>
      )}

      {!s.ranked && live && (q?.index === 0 || s.resumed) && s.unrankedWhy && (
        <p className="bubble mb-3 text-sm">{s.unrankedWhy}</p>
      )}

      {(s.phase === 'ready' || s.phase === 'loading') && (
        <Ready p={p} loading={s.phase === 'loading'} err={s.err} code={s.code} onStart={start} />
      )}

      {live && q && (
        <div ref={card} className="relative">
          <QuestionCard
            key={`${s.game}-${q.index}`}
            ref={head}
            q={q}
            palette={palette}
            pick={s.pick}
            reveal={rv}
            total={s.total}
            onPick={choose}
          >
            {s.phase === 'asking' && (
              <p className="mt-4 hidden text-muted text-sm [@media(pointer:fine)]:block">
                Keys: <kbd className="rounded border border-line px-1">1</kbd>-
                <kbd className="rounded border border-line px-1">4</kbd> or{' '}
                <kbd className="rounded border border-line px-1">A</kbd>-
                <kbd className="rounded border border-line px-1">D</kbd>
              </p>
            )}
            {s.phase === 'sending' && <Sending err={s.err} onRetry={retry} />}
            {s.phase === 'reveal' && rv && (
              <RevealPanel
                rv={rv}
                word={word}
                tone={tone}
                game={s.game}
                index={q.index}
                link={link}
                mode={p.mode}
                unrankedWhy={s.unrankedWhy}
                innerRef={panelEl}
              />
            )}
          </QuestionCard>
          {s.phase === 'reveal' && rv && (
            <NextBar
              last={!s.more}
              fetching={s.fetching}
              err={s.err}
              btn={nextBtn}
              innerRef={barEl}
              onNext={() => void advance()}
            />
          )}
          {s.phase === 'reveal' && rv && !reduced && (
            <div
              aria-hidden
              className="qz-flash"
              style={{
                ['--qz-flash' as string]:
                  tone === 'right'
                    ? 'var(--qz-ok)'
                    : tone === 'wrong'
                      ? 'var(--qz-bad)'
                      : 'var(--qz-warn)',
              }}
            />
          )}
        </div>
      )}

      <AnimatePresence>
        {fly && (
          <PointsFly
            key={fly.id}
            points={fly.points}
            from={fly.from}
            to={fly.to}
            onLand={() => setFly(null)}
          />
        )}
      </AnimatePresence>

      {s.phase === 'end' && s.summary && (
        <EndScreen
          summary={s.summary}
          label={p.label}
          mode={p.mode}
          signedIn={p.signedIn}
          unrankedWhy={s.unrankedWhy}
          lockedCount={s.lockedCount}
          target={{ mode: p.mode, universe: p.universe, character: p.character }}
          pendingSaved={pendingSaved}
          onPlayAgain={start}
        />
      )}
    </div>
  );
}

function toPalette(t?: [string, string, string]) {
  return t ? { c1: t[0], c2: t[1], c3: t[2] } : undefined;
}

/** Shown while the answer is in flight: instant feedback that the tap landed. */
function Sending({ err, onRetry }: { err: string; onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  if (err) {
    return (
      <div role="alert" className="bubble mt-4 space-y-2">
        <p>{err}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-sm btn-c3" onClick={onRetry}>
            Send my answer again
          </button>
          <Link to="/quiz" className="text-sm underline">
            Leave this game
          </Link>
        </div>
      </div>
    );
  }
  return (
    <p role="status" className="mt-4 flex items-center gap-2 font-head text-sm">
      <span aria-hidden className="size-3 animate-pulse round bg-c3" />
      Sending your answer…
      {slow && <span className="font-body text-muted"> slow connection, hang on</span>}
    </p>
  );
}

function RevealPanel({
  rv,
  word,
  tone,
  game,
  index,
  link,
  mode,
  unrankedWhy,
  innerRef,
}: {
  mode: QuizMode;
  unrankedWhy?: string;
  rv: QuizReveal;
  word: string;
  tone: 'right' | 'wrong' | 'time';
  game: string;
  index: number;
  link: string | null;
  innerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const verdict = rv.blind
    ? rv.timedOut
      ? "Time's up!"
      : word
    : rv.timedOut
      ? "Time's up!"
      : `${word} ${rv.correct ? 'Right!' : 'Not quite.'}`;
  return (
    <div
      ref={innerRef}
      data-reveal
      className="mt-3 space-y-2 border-line border-t-[3px] border-dashed pt-3 sm:mt-4"
    >
      {rv.streak >= 3 && rv.correct === true && <ComboBanner streak={rv.streak} />}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VerdictBurst tone={tone}>
          {rv.blind ? (
            <IconLock className="size-5" />
          ) : rv.correct ? (
            <IconCheck className="size-5" />
          ) : (
            <IconCross className="size-5" />
          )}
          {verdict}
        </VerdictBurst>
        {rv.correct === true && (
          <span className="inline-flex items-center gap-1 font-display text-2xl text-c3-text">
            <IconBolt className="size-5" /> +{rv.points}
          </span>
        )}
      </p>
      {rv.blind || rv.locked ? (
        <LockedTeaser blind={rv.blind} mode={mode} why={unrankedWhy} />
      ) : (
        <>
          {rv.why && <p className="text-pretty">{rv.why}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {rv.fansRight !== null && (
              <span className="chip pointer-events-none">
                {rv.fansRight <= 50
                  ? `Only ${Math.round(rv.fansRight)}% of fans got this`
                  : `${Math.round(rv.fansRight)}% of fans got this`}
              </span>
            )}
            {!rv.timedOut && (
              <span className="chip pointer-events-none">Answered in {rv.seconds.toFixed(1)}s</span>
            )}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer noopener"
                className="qz-hit inline-flex items-center underline underline-offset-2"
              >
                Source<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            <ReportFact game={game} index={index} />
          </div>
        </>
      )}
    </div>
  );
}

/** Today's daily keeps a missed answer secret until midnight IST: make that a reason to come back. */
function LockedTeaser({ blind, mode, why }: { blind: boolean; mode: QuizMode; why?: string }) {
  const [left, setLeft] = useState(msToIstMidnight());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msToIstMidnight()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="bubble relative -rotate-1 space-y-0.5 py-2">
      {!blind && (
        <p className="flex items-center gap-2 font-display text-2xl leading-none">
          <IconLock className="size-6" /> TOP SECRET!
        </p>
      )}
      <p className="font-head text-sm leading-snug">
        {blind
          ? 'Your answer is in. Blind run: no result is shown.'
          : 'Answer unlocks at midnight IST. Come back for it!'}
      </p>
      {blind && mode !== 'daily' ? (
        // Blind can happen in any mode: the server says why, so don't talk about the daily.
        <p className="text-xs">{why ?? 'This run is blind practice: no result is shown.'}</p>
      ) : blind ? (
        <p className="text-xs">
          Tomorrow,{' '}
          <Link to="/quiz#yesterday" className="underline">
            Yesterday's answers
          </Link>{' '}
          shows the right answers.
        </p>
      ) : (
        <p className="text-xs">
          Opens in {hhmm(left)} in{' '}
          <Link to="/quiz#yesterday" className="underline">
            Yesterday's answers
          </Link>{' '}
          on the hub.
        </p>
      )}
    </div>
  );
}

/** Pinned to the bottom of the screen so Next is always in reach and the question never scrolls away. */
function NextBar({
  last,
  fetching,
  err,
  btn,
  innerRef,
  onNext,
}: {
  last: boolean;
  fetching: boolean;
  err: string;
  btn: React.RefObject<HTMLButtonElement | null>;
  innerRef: React.RefObject<HTMLDivElement | null>;
  onNext: () => void;
}) {
  return (
    <div ref={innerRef} data-nextbar className="sticky bottom-3 z-20 mt-3 space-y-2">
      {err && (
        <p role="alert" className="bubble text-sm">
          {err}
        </p>
      )}
      {fetching && (
        <p role="status" className="flex items-center gap-2 font-head text-sm">
          <span aria-hidden className="size-3 animate-pulse round bg-c3" />
          Fetching your next question…
        </p>
      )}
      <button
        ref={btn}
        type="button"
        className="btn btn-c1 w-full text-lg shadow-ink"
        aria-disabled={fetching || undefined}
        onClick={onNext}
      >
        {fetching ? 'Loading…' : err ? 'Try again' : last ? 'See my results' : 'Next question'}{' '}
        <span aria-hidden>↵</span>
      </button>
    </div>
  );
}

function Ready({
  p,
  loading,
  err,
  code,
  onStart,
}: {
  p: QuizGameProps;
  loading: boolean;
  err: string;
  code: QuizErrorCode | null;
  onStart: () => void;
}) {
  const animate = useAnimate();
  const usedUp = p.mode === 'daily' && !p.openDaily && p.startsLeft === 0;
  return (
    <section
      aria-labelledby="qz-ready"
      className="space-y-4"
      style={
        p.tint
          ? (scopeVars({ c1: p.tint[0], c2: p.tint[1], c3: p.tint[2] }) as React.CSSProperties)
          : undefined
      }
    >
      <div className="panel halftone p-5 text-center sm:p-8">
        <p className="kicker">{p.label}</p>
        <m.h2
          id="qz-ready"
          className="h-display ink-text mb-3 text-5xl text-c1-text sm:text-7xl"
          initial={animate ? { scale: 0.6, rotate: -6, y: -30 } : false}
          animate={{ scale: 1, rotate: -2, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 14 }}
        >
          {p.heading}
        </m.h2>
        {usedUp ? (
          <p className="mx-auto mb-5 max-w-md font-head text-lg">
            You've used today's daily starts. Back tomorrow for a fresh set! Until then, try a
            universe or a character quiz.
          </p>
        ) : p.mode === 'daily' && p.openDaily ? (
          <p className="mx-auto mb-5 max-w-md font-head text-lg">{resumeLine(p.openDaily)}</p>
        ) : (
          <ul className="mx-auto mb-5 max-w-md space-y-1 text-left text-sm sm:text-base">
            <li>
              <strong>{p.mode === 'character' ? 'Up to 10 questions' : '10 questions'}</strong>, 15
              seconds each. Quick answers earn a speed bonus.
            </li>
            <li>Harder questions are worth more. Three right in a row starts a streak.</li>
            {p.mode === 'daily' && (
              <li>
                {p.signedIn
                  ? 'Everyone gets the same ten. On a ranked daily, a missed answer stays secret until midnight IST.'
                  : 'Everyone gets the same ten.'}
              </li>
            )}
            <li>
              {p.signedIn
                ? p.mode === 'daily'
                  ? `Signed in as ${p.me}: your first try today counts for the Daily board. Later tries are blind practice.`
                  : p.mode === 'universe'
                    ? `Signed in as ${p.me}: your best ${p.heading} game counts for that universe's board.`
                    : `Signed in as ${p.me}: this one has no board of its own. Right answers on first sight add to your Facts known.`
                : p.mode === 'daily'
                  ? 'Guests never rank on the daily: yours is blind practice, answers lock in and results unlock at midnight IST. Join first to play the ranked one.'
                  : 'Playing as a guest is fine. Join after the last question to save your score.'}
            </li>
          </ul>
        )}
        {err && (
          <p role="alert" className="bubble mx-auto mb-4 max-w-md text-left">
            {code === 'daily-cap' ? (
              <>
                You've used today's daily starts on this browser or account. Plenty more to play in
                a universe or character quiz!{' '}
                <Link to="/quiz#universes" className="underline">
                  Pick one
                </Link>
              </>
            ) : code === 'rate' ? (
              'Whoa, too many tries too fast. Wait a few seconds, then try again.'
            ) : (
              err
            )}
          </p>
        )}
        {usedUp ? (
          <Link to="/quiz#universes" className="btn btn-c1 px-8 text-2xl">
            Play a universe quiz
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-c1 px-8 text-2xl"
            disabled={loading}
            onClick={onStart}
          >
            {loading
              ? 'Loading questions…'
              : err
                ? 'Try again'
                : p.mode === 'daily' && p.openDaily
                  ? 'RESUME'
                  : "Let's go!"}
          </button>
        )}
        {loading && (
          <div aria-hidden className="mx-auto mt-5 max-w-md space-y-2">
            <div className="qz-skel h-5 w-3/4" />
            <div className="qz-skel h-12" />
            <div className="qz-skel h-12" />
          </div>
        )}
      </div>
      <p className="text-center text-sm">
        <Link to="/quiz" className="underline">
          Back to Fact Frenzy
        </Link>
      </p>
    </section>
  );
}

function LiveSay({ bus }: { bus: React.MutableRefObject<((t: string) => void) | null> }) {
  const [text, setText] = useState('');
  useEffect(() => {
    bus.current = setText;
    return () => {
      bus.current = null;
    };
  }, [bus]);
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}

/** Reasons that mean this game can't go on: say so plainly instead of offering a pointless retry. */
function goneKind(code: QuizErrorCode | null): 'closed' | 'replaced' | 'expired' | 'over' | null {
  return code === 'closed' || code === 'replaced' || code === 'expired' || code === 'over'
    ? code
    : null;
}

function GonePanel({
  kind,
  onDaily,
}: {
  kind: 'closed' | 'replaced' | 'expired' | 'over';
  onDaily: () => void;
}) {
  return (
    <section aria-labelledby="qz-gone" className="panel halftone space-y-3 p-5 text-center sm:p-8">
      <h2
        id="qz-gone"
        tabIndex={-1}
        className="h-display ink-text text-4xl text-c1-text sm:text-6xl"
      >
        {kind === 'closed'
          ? 'THE DAILY CLOSED!'
          : kind === 'replaced'
            ? 'NEWER GAME!'
            : kind === 'over'
              ? 'ALL DONE!'
              : 'TIMED OUT!'}
      </h2>
      <p role="alert" className="mx-auto max-w-md">
        {kind === 'closed' &&
          "This daily closed at midnight IST, so your answers can't go in any more. Today's daily is a fresh set, and yesterday's answers are all unlocked."}
        {kind === 'replaced' &&
          'This game was replaced by a newer one of the same kind, maybe in another tab. Only the newest one counts, so carry on there. (Your daily, if you have one open, is safe.)'}
        {kind === 'expired' &&
          'This game sat open for too long and has expired. Start a fresh one.'}
        {kind === 'over' && 'This game is already over, so there is nothing more to answer.'}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {kind === 'closed' && (
          <>
            <Link to="/quiz#yesterday" className="btn btn-c3">
              Yesterday's answers
            </Link>
            <button type="button" className="btn btn-c1" onClick={onDaily}>
              Play today's daily
            </button>
          </>
        )}
        <Link to="/quiz" className="btn">
          Back to Fact Frenzy
        </Link>
      </div>
    </section>
  );
}
