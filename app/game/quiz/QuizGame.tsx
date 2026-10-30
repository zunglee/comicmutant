/** Quiz Duel: the shell's canvas shows the duel; this panel holds the question and answers. */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { rng } from '../engine/math';
import { GameShell, type Phase } from '../shell/GameShell';
import type { GameProps } from '../types';
import {
  answerFit,
  BASE_DMG,
  COMBO_AT,
  COMBO_MULT,
  COUNTER_DMG,
  FAST_WINDOW,
  FIRE_AT,
  MAX_HP,
  QUESTION_TIME,
  QUESTIONS,
  QUIZ_AI,
  SPEED_DMG,
  sampleQuestions,
} from './logic';
import { type PlayerStats, QuizSim, type QuizSnapshot } from './sim';

const P2_KEYS = ['7', '8', '9', '0'];
const RIGHT_CLS = 'bg-[#3ddc84] text-[#0d0b10]';
const WRONG_CLS = 'bg-[#ff3b30] text-[#0d0b10]';

export default function QuizGame(props: GameProps) {
  const pool = props.questions ?? [];
  // Questions asked in recent matches, so Replay draws new ones until the pool runs dry.
  const recent = useRef(new Set<string>());
  const n = Math.min(QUESTIONS, pool.length);
  const ai = QUIZ_AI[props.difficulty];
  const cpu =
    props.vs === 'cpu'
      ? `The ${props.difficulty} CPU is right ~${Math.round(ai.accuracy * 100)}% of the time and answers in ${ai.min}–${ai.max} s.`
      : 'Player 2 answers with 7 8 9 0.';
  return (
    <GameShell
      {...props}
      game="quiz"
      maxHeightVh={42}
      keysHint="Tap an answer, or press its number. Esc pauses."
      scoreUnit="HP"
      blurb={`${n} trivia questions. Right answers land hits, fast ones hit harder — K.O. your rival!`}
      controls={{
        p1: [
          { keys: '1–4', does: 'Choose an answer' },
          { keys: 'Enter', does: 'Next question now' },
        ],
        p2: [
          { keys: '7 8 9 0', does: 'Choose an answer' },
          { keys: 'Enter', does: 'Next question now' },
        ],
      }}
      touch={{}}
      noPad
      create={(env) => {
        const seed = (Math.random() * 2 ** 32) >>> 0;
        const qs = sampleQuestions(pool, QUESTIONS, rng(seed), recent.current);
        if (recent.current.size + qs.length > pool.length - QUESTIONS) recent.current.clear();
        for (const q of qs) recent.current.add(q.q);
        return new QuizSim(env, qs, seed);
      }}
      panel={(sim, phase) =>
        sim instanceof QuizSim ? (
          <Panel
            sim={sim}
            phase={phase}
            local={props.vs === 'local'}
            p1={props.p1.alias}
            p2={props.vs === 'cpu' ? `${props.p2.alias} (CPU)` : props.p2.alias}
            cpu={cpu}
            colors={[props.p1.theme.palette.c1, props.p2.theme.palette.c1]}
            aliases={[props.p1.alias, props.p2.alias]}
          />
        ) : null
      }
    />
  );
}

const NOOP = () => () => {};
const secs = (t: number | null | undefined) => (t == null ? '—' : `${t.toFixed(1)} s`);

function Panel({
  sim,
  phase,
  local,
  p1,
  p2,
  cpu,
  colors,
  aliases,
}: {
  sim: QuizSim;
  phase: Phase;
  local: boolean;
  p1: string;
  p2: string;
  cpu: string;
  colors: [string, string];
  aliases: [string, string];
}) {
  const s: QuizSnapshot = useSyncExternalStore(
    sim.subscribe ?? NOOP,
    sim.getSnapshot,
    sim.getSnapshot,
  );
  const live = phase === 'playing';
  const nextRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const ansRef = useRef<HTMLOListElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.repeat) return;
      const i1 = ['1', '2', '3', '4'].indexOf(e.key);
      const i2 = P2_KEYS.indexOf(e.key);
      if (i1 >= 0) sim.answer(0, i1);
      else if (i2 >= 0 && local) sim.answer(1, i2);
      else if (e.key === 'Enter' && sim.snap.phase === 'reveal') {
        e.preventDefault();
        sim.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sim, local, live]);

  // New question: put the canvas top just under the sticky site header and the answers on screen
  // (answers win if both can't fit), then focus the question — not an answer, so a held Enter
  // can't pick one by accident. The shell leaves play-time scrolling to the quiz.
  // The first question jumps instantly (a smooth scroll can stall while the match boots); later
  // ones glide, and every placement is re-measured once the scroll settles and corrected.
  useEffect(() => {
    if (!live || s.phase !== 'ask') return;
    const box = boxRef.current;
    const canvas = box?.parentElement?.querySelector('canvas');
    const ans = ansRef.current;
    headRef.current?.focus({ preventScroll: true });
    if (!box || !canvas || !ans) return;
    placeQuestion(box, canvas, ans, s.i === 0 ? 'auto' : smooth());
    const t = setTimeout(() => placeQuestion(box, canvas, ans, 'auto'), 500);
    return () => clearTimeout(t);
  }, [s.phase, s.i, live]);

  // Reveal: where the panel scrolls on its own (phones), bring the verdict and hit strip into it
  // below the pinned Q header. Never scrolls the page.
  useEffect(() => {
    const box = boxRef.current;
    const row = revealRef.current;
    if (!live || s.phase !== 'reveal' || !box || !row) return;
    if (getComputedStyle(box).overflowY !== 'auto' || box.scrollHeight <= box.clientHeight) return;
    const head = box.querySelector<HTMLElement>('[data-quiz-head]');
    const pinned =
      getComputedStyle(head ?? box).position === 'sticky' ? (head?.offsetHeight ?? 0) : 0;
    const y = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: y - pinned - 8, behavior: smooth() });
  }, [s.phase, live]);

  useEffect(() => {
    if (live && s.phase === 'reveal' && !s.busy && s.ko === null)
      nextRef.current?.focus({ preventScroll: true });
  }, [s.phase, s.busy, s.ko, live]);

  const q = s.q;
  if (phase === 'start') return <HowTo cpu={cpu} />;
  if (s.phase === 'over' || phase === 'over') return <Stats s={s} p1={p1} p2={p2} />;
  if (!q)
    return <p className="panel mx-auto mt-4 max-w-3xl p-4">No questions available right now.</p>;
  if (phase === 'paused')
    return (
      <p className="panel mx-auto mt-3 max-w-3xl p-4 text-center">
        Paused — the question is hidden until you resume.
      </p>
    );

  const mine = s.answers[0];
  const theirs = s.answers[1];
  const reveal = s.phase !== 'ask';
  const o = s.outcome;
  const elapsed = QUESTION_TIME - s.timeLeft;
  const fast = !reveal && elapsed <= FAST_WINDOW;
  const k = s.timeLeft / QUESTION_TIME;
  const status = (who: 0 | 1, name: string) => {
    const a = s.answers[who];
    const other = s.answers[who ? 0 : 1];
    if (!reveal)
      return a
        ? `${name}: locked in · ${secs(a.time)}${!other || a.time <= other.time ? ' · 1st' : ''}`
        : `${name}: ${who === 1 && s.cpu ? 'CPU thinking…' : 'thinking…'}`;
    const r = o?.[who];
    if (!r) return name;
    const counter = r.counter ? ` · counter ${r.counter}` : '';
    return r.ok
      ? `${name}: right · ${secs(a?.time)}${r.first ? ' · 1st' : ''} · ${r.dmg} damage${counter}`
      : `${name}: ${r.timedOut ? 'no answer' : 'wrong'}${counter || ' · no damage'}`;
  };

  return (
    <section
      ref={boxRef}
      data-quiz-side
      className="panel halftone mx-auto mt-3 max-w-3xl scroll-mb-3 p-3 sm:p-4"
      aria-label="Question"
    >
      <style>{SIDE_CSS}</style>
      <div data-quiz-head>
        <HpRow hp={s.hp} names={[p1, p2]} colors={colors} />
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="kicker min-w-0 truncate">
            Q {Math.min(s.i + 1, s.total)}/{s.total} · about {q.name}
          </p>
          <StreakBadge key={`a${s.streak[0]}`} streak={s.streak[0]} who={p1} />
          <StreakBadge key={`b${s.streak[1]}`} streak={s.streak[1]} who={aliases[1]} rival />
          <p
            data-quiz-timer
            className={`chip ml-auto shrink-0 cursor-default ${reveal ? '' : k < 0.33 ? WRONG_CLS : fast ? RIGHT_CLS : ''}`}
            aria-live="off"
          >
            {reveal ? 'Time!' : `${Math.ceil(s.timeLeft)} s${fast ? ' · fast bonus' : ''}`}
          </p>
        </div>
        <div
          className="mb-3 h-3 overflow-hidden rounded-full border-2 border-line bg-bg"
          role="progressbar"
          aria-label="Time left"
          aria-valuemin={0}
          aria-valuemax={QUESTION_TIME}
          aria-valuenow={Math.ceil(s.timeLeft)}
        >
          <div
            className={`h-full transition-[width] duration-100 ease-linear ${k < 0.33 ? 'bg-[#ff3b30]' : fast ? 'bg-[#3ddc84]' : 'bg-c3'}`}
            style={{ width: `${k * 100}%` }}
          />
        </div>
      </div>
      <h2 ref={headRef} tabIndex={-1} className="h-head mb-3 text-lg outline-none sm:text-2xl">
        {q.q}
      </h2>
      <ol
        ref={ansRef}
        className={`grid gap-2 ${local || reveal ? 'sm:grid-cols-2' : 'grid-cols-2'}`}
      >
        {q.options.map((opt, i) => {
          const right = reveal && i === q.answer;
          const wrongPick = reveal && mine?.choice === i && i !== q.answer;
          const cls = right
            ? RIGHT_CLS
            : wrongPick
              ? `${WRONG_CLS} line-through`
              : !reveal && mine?.choice === i
                ? 'btn-c1'
                : '';
          const p2Pick = reveal && theirs?.choice === i;
          // On reveal only the options someone picked (and the right one) stay, so the verdict and
          // hit strip fit under the canvas without scrolling it away.
          if (reveal && !right && !wrongPick && !p2Pick) return null;
          return (
            <li key={opt} className="flex min-w-0 gap-2">
              <button
                type="button"
                className={`btn relative min-h-[48px] min-w-0 flex-1 gap-2! px-2.5! py-1.5! sm:px-3.5! justify-start! text-left normal-case disabled:opacity-100 ${reveal && !right && !wrongPick ? 'opacity-60!' : ''} ${cls}`}
                disabled={!live || reveal || !!mine}
                aria-pressed={mine?.choice === i}
                onClick={() => sim.answer(0, i)}
              >
                <kbd className="rounded border-2 border-line bg-bg px-1.5 font-head text-fg">
                  {i + 1}
                </kbd>
                {/* Wrap on word boundaries only (hyphenating where the dictionary allows); long
                    answers step the type down instead of breaking mid-word. */}
                <span
                  lang="en"
                  className={`min-w-0 flex-1 leading-tight [overflow-wrap:normal] [hyphens:auto] ${answerFit(opt)}`}
                >
                  {opt}
                </span>
                {p2Pick && (
                  // A tag on the button's top edge, so it never takes width from the answer text.
                  <span className="absolute -top-2.5 right-2 rounded border-2 border-line bg-bg px-1.5 text-[10px] text-fg leading-tight">
                    {local ? 'P2' : 'CPU'}
                  </span>
                )}
                {right && (
                  <span>
                    <span aria-hidden>✓</span>
                    <span className="sr-only">correct answer</span>
                  </span>
                )}
                {wrongPick && (
                  <span>
                    <span aria-hidden>✗</span>
                    <span className="sr-only">your pick, wrong</span>
                  </span>
                )}
              </button>
              {local && (
                <button
                  type="button"
                  className={`btn btn-sm min-h-[48px] min-w-[52px] ${!reveal && theirs?.choice === i ? 'btn-c1' : ''}`}
                  disabled={!live || reveal || !!theirs}
                  aria-label={`${p2}: answer ${i + 1}`}
                  onClick={() => sim.answer(1, i)}
                >
                  P2·{P2_KEYS[i]}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!reveal ? (
        <div data-quiz-chips className="mt-2 flex flex-wrap gap-2 text-sm">
          {([0, 1] as const).map((w) => (
            <span
              key={w}
              className={`chip cursor-default normal-case ${s.answers[w] ? 'btn-c1' : ''}`}
            >
              {status(w, w ? p2 : p1)}
            </span>
          ))}
        </div>
      ) : (
        <div
          ref={revealRef}
          data-quiz-reveal
          className="mt-2 flex flex-wrap items-center gap-2 sm:flex-nowrap"
          aria-live="polite"
        >
          <div className="bubble basis-full py-2! text-sm sm:basis-auto sm:flex-1">
            <p className="font-head">{verdict(s, p1)}</p>
            <HitStrip s={s} names={aliases} />
            <p>
              <strong>{q.options[q.answer]}.</strong> {q.why}
            </p>
          </div>
          {s.phase === 'reveal' && s.ko === null && (
            <button
              ref={nextRef}
              type="button"
              className="btn btn-c1 shrink-0"
              disabled={s.busy}
              onClick={() => sim.next()}
            >
              {s.busy
                ? 'Hits landing…'
                : `${s.i + 1 >= s.total ? 'Result' : 'Next'}${s.nextIn !== null ? ` (${Math.ceil(s.nextIn)})` : ''}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function verdict(s: QuizSnapshot, p1: string) {
  const o = s.outcome?.[0];
  const t = s.answers[0]?.time;
  if (s.ko !== null) return s.ko === 1 ? 'K.O.! You win the duel!' : `K.O.! ${p1} is down.`;
  const them = s.outcome?.[1];
  if (!o || !them) return '';
  const mine = o.counter ? ` They missed — you counter for ${o.counter}.` : '';
  if (o.ok)
    return `Right in ${secs(t)}${o.first ? ', first' : ''}! You hit for ${o.dmg}${o.streak >= COMBO_AT ? ` — COMBO x${o.streak}` : ''}.${mine}`;
  if (o.timedOut) return `Too slow — no hit.${mine}`;
  return them.counter
    ? `Wrong — you miss and take a ${them.counter} HP counter.`
    : them.ok
      ? 'Wrong — your attack misses.'
      : 'Wrong — you both miss.';
}

/** The reveal's strikes as chips (attacker ▸ hit ▸ defender HP), so the duel reads without the canvas. */
function HitStrip({ s, names }: { s: QuizSnapshot; names: [string, string] }) {
  // Nobody hit: the verdict line above already says so.
  if (!s.strikes.length) return null;
  const chip = 'rounded-full border-2 border-line px-2 py-0.5 font-head text-xs';
  return (
    <ol className="my-1 flex flex-wrap items-center gap-1.5" aria-label="Hits this question">
      {s.strikes.map((k) => {
        const landed = k.state === 'landed';
        const tone = !landed
          ? 'bg-bg text-muted'
          : k.counter || k.streak >= FIRE_AT
            ? 'bg-[#ff9f1a] text-[#0d0b10]'
            : 'bg-c3 text-on-c3';
        return (
          <li
            key={`${k.who}${k.counter ? 'c' : 'h'}`}
            className={`${chip} ${tone} ${landed ? 'motion-safe:animate-[quiz-hit_0.5s_ease-out]' : ''}`}
          >
            {names[k.who]} ▸ {k.counter ? 'COUNTER!' : k.word}
            {k.mult > 1 ? ` ×${k.mult}${k.streak >= FIRE_AT ? ' ON FIRE' : ''}` : ''} −{k.dmg} ▸{' '}
            {names[k.who ? 0 : 1]}{' '}
            {landed ? `${k.hpAfter} HP` : k.state === 'blocked' ? '(K.O. — no hit)' : '…'}
          </li>
        );
      })}
      {s.ko !== null && (
        <li className={`${chip} ${WRONG_CLS} motion-safe:animate-[quiz-hit_0.5s_ease-out]`}>
          K.O.!
        </li>
      )}
    </ol>
  );
}

/** Panel padding + shadow below the last answer row, kept inside the screen and the panel. */
const ANSWER_GAP = 24;

/**
 * Scroll so the canvas top sits under the sticky header and the answers end ANSWER_GAP above the
 * screen bottom (answers win if both can't fit). On phones the panel then becomes a fixed-height
 * scroll box filling the rest of the screen, so the explanation scrolls inside it on reveal and
 * the page never jumps between questions.
 */
function placeQuestion(
  box: HTMLElement,
  canvas: HTMLCanvasElement,
  ans: HTMLElement,
  behavior: ScrollBehavior,
) {
  const top = headerBottom() + 8;
  box.style.setProperty('--quiz-top', `${top}px`);
  box.style.removeProperty('--quiz-max');
  box.scrollTop = 0;
  const toCanvas = canvas.getBoundingClientRect().top - top;
  const toAnswers = ans.getBoundingClientRect().bottom - (window.innerHeight - ANSWER_GAP);
  const room = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
  const delta = Math.max(-window.scrollY, Math.min(room, Math.max(toCanvas, toAnswers)));
  const boxTop = box.getBoundingClientRect().top - delta;
  // The panel's height always covers the answers plus its bottom padding (never clips the last row).
  const need = ans.getBoundingClientRect().bottom - delta - boxTop + ANSWER_GAP - 8;
  const maxH = Math.max(need, window.innerHeight - boxTop - 8);
  if (maxH >= 200) box.style.setProperty('--quiz-max', `${Math.ceil(maxH)}px`);
  if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior });
  fitAnswers(box, ans);
}

/**
 * Where the panel is its own fixed-height scroll box (short landscape), make the last answer row
 * fit: first tighten type and spacing, then — if it still overflows — scroll the panel just enough.
 */
function fitAnswers(box: HTMLElement, ans: HTMLElement) {
  delete box.dataset.tight;
  if (getComputedStyle(box).overflowY !== 'auto') return;
  const over = () =>
    ans.getBoundingClientRect().bottom -
    (box.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).paddingBottom));
  if (over() <= 0) return;
  box.dataset.tight = '1';
  const left = over();
  if (left > 0) box.scrollTop = Math.ceil(left);
}

const smooth = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** Bottom of the sticky/fixed site header (0 when it scrolls away with the page). */
function headerBottom() {
  const h = document.querySelector('header');
  if (!h) return 0;
  const pos = getComputedStyle(h).position;
  return pos === 'sticky' || pos === 'fixed' ? Math.max(0, h.getBoundingClientRect().bottom) : 0;
}

/**
 * Short landscape screens (phones on their side): canvas left, question panel right, both on
 * screen with no scrolling. Scoped to the game section that holds this panel.
 */
const SIDE_CSS = `@media (max-width: 639px) {
  [data-quiz-side] { height: var(--quiz-max, auto); overflow-y: auto; overscroll-behavior: contain; }
}
@media (max-width: 639px), (orientation: landscape) and (max-height: 500px) {
  [data-quiz-side] [data-quiz-head] { position: sticky; top: -.75rem; z-index: 5; margin: -.75rem -.75rem .5rem; padding: .75rem .75rem .25rem; background: var(--card); }
}
@media (orientation: landscape) and (max-height: 500px) {
  [data-quiz-side] [data-quiz-head] { top: -.5rem; margin: -.5rem -.5rem .375rem; padding: .5rem .5rem .25rem; }
  section:has(> [data-quiz-side]) { display: grid; grid-template-columns: minmax(0, 45%) minmax(0, 1fr); column-gap: .75rem; align-items: start; }
  section:has(> [data-quiz-side]) > div:first-child { width: 100% !important; position: sticky; top: var(--quiz-top, 4.5rem); }
  section:has(> [data-quiz-side]) > :not(div:first-child):not([data-quiz-side]) { grid-column: 1 / -1; }
  [data-quiz-side] { margin-top: 0 !important; max-width: none !important; padding: .5rem !important; height: calc(100dvh - var(--quiz-top, 4.5rem) - .5rem); overflow-y: auto; overscroll-behavior: contain; }
  [data-quiz-side] h2 { font-size: 1rem; line-height: 1.3; margin-bottom: .375rem; }
  [data-quiz-side] [data-quiz-chips] { display: none; }
  /* The canvas HUD sits right beside the panel here, so its HP row would only repeat it. */
  [data-quiz-side] [data-quiz-hp] { display: none; }
  [data-quiz-side][data-tight] h2 { font-size: .875rem; line-height: 1.2; margin-bottom: .25rem; }
  [data-quiz-side][data-tight] ol { gap: .375rem; }
  [data-quiz-side][data-tight] ol button { min-height: 44px; padding-top: .2rem !important; padding-bottom: .2rem !important; }
  [data-quiz-side][data-tight] [data-quiz-head] > div { margin-bottom: .25rem; }
  [data-quiz-side] [data-quiz-timer], [data-quiz-side] [data-quiz-streak] { min-height: 28px; }
  [data-quiz-side] [data-quiz-reveal] { flex-wrap: wrap !important; }
  [data-quiz-side] [data-quiz-reveal] > .bubble { flex-basis: 100%; }
  [data-quiz-side] [data-quiz-reveal] li { font-size: 10px; padding: 0 .4rem; }
}
/* Wide, tall screens: the canvas HUD is on screen next to the panel, so its HP row would only repeat it. */
@media (min-width: 640px) and (min-height: 600px) { [data-quiz-hp] { display: none; } }
@keyframes quiz-hit { 0% { transform: scale(1.3); filter: brightness(1.8); } 100% { transform: scale(1); filter: none; } }`;

/** Streak meter for one player: 2 in a row → "next ×2", 3+ → ×2 COMBO, 5+ → ON FIRE. */
function StreakBadge({ streak, who, rival }: { streak: number; who: string; rival?: boolean }) {
  // The rival's badge only appears once it is a threat (×2 or more), and stays short.
  if (streak < (rival ? COMBO_AT : COMBO_AT - 1)) return null;
  const fire = streak >= FIRE_AT;
  const combo = streak >= COMBO_AT;
  const tone = fire ? 'bg-[#ff9f1a] text-[#0d0b10]' : combo ? 'bg-c3 text-on-c3' : '';
  const label = rival
    ? `${fire ? 'ON FIRE' : 'COMBO'} ×${COMBO_MULT}`
    : fire
      ? `ON FIRE ×${COMBO_MULT} · ${streak}`
      : combo
        ? `×${COMBO_MULT} COMBO · ${streak}`
        : `${streak} in a row · next ×${COMBO_MULT}`;
  return (
    <span
      data-quiz-streak
      className={`chip shrink-0 cursor-default ${tone} ${rival ? 'opacity-80' : ''} ${combo ? 'motion-safe:animate-[quiz-hit_0.5s_ease-out]' : ''}`}
    >
      <span className={rival ? '' : 'sr-only'}>{who}: </span>
      {label}
    </span>
  );
}

/** Both HP bars in the panel, so the race stays visible when the canvas is scrolled away. */
function HpRow({
  hp,
  names,
  colors,
}: {
  hp: [number, number];
  names: [string, string];
  colors: [string, string];
}) {
  return (
    <div
      data-quiz-hp
      className="mb-2 grid grid-cols-2 gap-3 font-head text-xs"
      role="img"
      aria-label={`HP: ${names[0]} ${hp[0]}, ${names[1]} ${hp[1]}`}
    >
      {([0, 1] as const).map((w) => {
        const pct = Math.max(0, Math.min(100, (hp[w] / MAX_HP) * 100));
        return (
          <div key={w} className={`flex min-w-0 items-center gap-2 ${w ? 'flex-row-reverse' : ''}`}>
            <span className="max-w-[40%] truncate">{names[w]}</span>
            <div className="h-3 min-w-8 flex-1 overflow-hidden rounded-full border-2 border-line bg-bg">
              <div
                className={`h-full transition-[width] duration-300 ${w ? 'ml-auto' : ''}`}
                style={{ width: `${pct}%`, background: pct < 25 ? '#ff3b30' : colors[w] }}
              />
            </div>
            <span className="w-7 shrink-0 text-center tabular-nums">{hp[w]}</span>
          </div>
        );
      })}
    </div>
  );
}

function HowTo({ cpu }: { cpu: string }) {
  return (
    <section className="panel halftone mx-auto mt-3 max-w-3xl p-3 sm:p-4" aria-label="How to play">
      <h2 className="h-head mb-2 text-lg">How a duel works</h2>
      <ol className="grid gap-1 text-sm sm:grid-cols-2">
        <li>1. {QUESTION_TIME} s per question: press 1–4 or tap an answer.</li>
        <li>
          2. Right = your fighter strikes for {BASE_DMG}–{BASE_DMG + SPEED_DMG}. Answer within{' '}
          {FAST_WINDOW} s for the full hit.
        </li>
        <li>
          3. Wrong = MISS, and if your rival got it right they counter for {COUNTER_DMG}. Too slow =
          no hit.
        </li>
        <li>
          4. {COMBO_AT} right in a row = ×{COMBO_MULT} damage; {FIRE_AT} = ON FIRE! A miss resets
          it.
          {MAX_HP} HP each: K.O. wins, else most HP after the last question.
        </li>
      </ol>
      <p className="mt-2 text-muted text-sm">{cpu}</p>
    </section>
  );
}

function Stats({ s, p1, p2 }: { s: QuizSnapshot; p1: string; p2: string }) {
  const rows: [string, (st: PlayerStats, who: 0 | 1) => string][] = [
    ['HP left', (_, w) => `${s.hp[w]} / ${MAX_HP}`],
    ['Right answers', (st) => `${st.right} / ${s.asked}`],
    ['Accuracy', (st) => `${Math.round((st.right / Math.max(1, s.asked)) * 100)}%`],
    ['Fastest right answer', (st) => secs(st.fastest)],
    ['Average right answer', (st) => (st.right ? secs(st.rightTime / st.right) : '—')],
    ['Best streak', (st) => String(st.bestStreak)],
    ['Damage dealt', (st) => String(st.dealt)],
  ];
  return (
    <section className="panel halftone mx-auto mt-3 max-w-3xl p-3 sm:p-4" aria-label="Match stats">
      <h2 className="h-head mb-2 text-lg">
        {s.ko !== null ? `K.O. on question ${s.asked}` : `Final after ${s.asked} questions`}
      </h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="kicker">
            <th scope="col">Stat</th>
            <th scope="col">{p1}</th>
            <th scope="col">{p2}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-line border-t">
              <th scope="row" className="py-1 font-normal text-muted">
                {label}
              </th>
              <td className="py-1 font-head">{f(s.stats[0], 0)}</td>
              <td className="py-1 font-head">{f(s.stats[1], 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-muted text-xs">Replay draws a fresh set of questions.</p>
    </section>
  );
}
