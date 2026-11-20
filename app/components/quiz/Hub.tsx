/** Fact Frenzy hub pieces: animated title, daily card, universe cards, character picker. */
import { m } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAnimate } from '~/lib/fx';
import type { DailyArchive, OpenDaily } from '~/lib/quiz-contract';
import { PUBLISHED_UNIVERSES, type PublishedUniverse, UNIVERSE_LABEL } from '~/lib/taxonomy';
import { contrast, scopeVars } from '~/lib/theme/compute';
import { useSkin } from '~/skins/context';
import { useSkinMotion } from '~/skins/motion';
import { dayLabelOf, hhmm, msToIstMidnight, playHref, resumeLine } from './daily';
import { IconBolt, IconCheck, IconSearch } from './qicons';

export interface RosterRow {
  slug: string;
  name: string;
  universe: PublishedUniverse;
  palette: [string, string, string];
}

const pal = (t: [string, string, string]) => scopeVars({ c1: t[0], c2: t[1], c3: t[2] });

/* ── title ─────────────────────────────────────────────────────────────────────────────── */

const FLOATERS = [
  { t: '?!', cls: 'left-[4%] top-2 text-6xl text-c3', r: '-10deg' },
  { t: 'POW!', cls: 'right-[3%] top-0 text-5xl text-c1-text', r: '8deg' },
  { t: '?', cls: 'left-[14%] bottom-0 text-7xl text-c1-text', r: '12deg' },
  { t: 'BAM!', cls: 'right-[12%] bottom-1 text-4xl text-c3', r: '-8deg' },
];

export function HubTitle() {
  const mo = useSkinMotion();
  const animate = useAnimate();
  const word = (w: string, base: number, tilt: number) =>
    [...w].map((ch, i) => (
      <m.span
        // biome-ignore lint/suspicious/noArrayIndexKey: letters of a fixed word.
        key={`${w}-${i}`}
        aria-hidden
        className={`inline-block cursor-default ${(i + base) % 2 ? 'text-c3' : 'text-c1-text'}`}
        initial={animate ? { y: -120, rotate: (i % 2 ? 1 : -1) * 25, scale: 0.4 } : false}
        animate={{ y: 0, rotate: tilt + (i % 2 ? 2 : -2), scale: 1 }}
        whileHover={{ y: -10, rotate: (i % 2 ? -1 : 1) * 12, scale: 1.18 }}
        transition={mo.spring({ stiffness: 460, damping: 13 }, mo.delay(i + base, 0.05))}
      >
        {ch}
      </m.span>
    ));
  return (
    <header className="relative mb-3 px-2 pt-1 pb-2 text-center sm:mb-8 sm:pt-4 sm:pb-8">
      {animate &&
        FLOATERS.map((f) => (
          <span
            key={f.t}
            aria-hidden
            className={`qz-float pointer-events-none absolute hidden font-display opacity-80 sm:block ${f.cls}`}
            style={{ ['--r' as string]: f.r }}
          >
            {f.t}
          </span>
        ))}
      <m.p
        className="kicker"
        initial={animate ? { y: -12, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={mo.calm ? mo.tween(0.3, { delay: 0.1 }) : { delay: 0.1 }}
      >
        The facts quiz for comic fans
      </m.p>
      <h1 className="h-display ink-text text-[clamp(3rem,14.5vw,5rem)] leading-[0.9] sm:text-[clamp(5rem,13vw,9rem)]">
        <span className="sr-only">Fact Frenzy</span>
        <span aria-hidden className="max-sm:mr-3 max-sm:inline-block sm:block">
          {word('FACT', 0, -3)}
        </span>
        <span aria-hidden className="max-sm:inline-block sm:block">
          {word('FRENZY', 4, 2)}
        </span>
      </h1>
      <m.p
        className="mx-auto mt-3 max-w-xl text-lg max-sm:hidden"
        initial={animate ? { y: 16, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={mo.calm ? mo.tween(0.3, { delay: 0.7 }) : { delay: 0.7 }}
      >
        Four options. Fifteen seconds. 108 characters to prove you know. Build a streak, beat the
        clock, climb the boards.
      </m.p>
    </header>
  );
}

/* ── daily ─────────────────────────────────────────────────────────────────────────────── */

export function DailyCard({
  dayLabel,
  open,
  signedIn,
  startsLeft,
}: {
  dayLabel: string;
  open: OpenDaily | null;
  signedIn: boolean;
  /** Daily starts this browser/account has left today; null when unknown. */
  startsLeft: number | null;
}) {
  const mo = useSkinMotion();
  const usedUp = !open && startsLeft === 0;
  const animate = useAnimate();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(msToIstMidnight());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <m.section
      aria-labelledby="qz-daily"
      className="panel-c1 halftone qz-sweep relative mb-5 overflow-hidden p-3 sm:mb-10 sm:p-7"
      initial={animate ? { y: 40, rotate: 1.5, scale: 0.96 } : false}
      animate={{ y: 0, rotate: -0.6, scale: 1 }}
      transition={mo.spring({ stiffness: 240, damping: 16 }, 0.3)}
    >
      <span
        aria-hidden
        hidden={!!open || usedUp}
        className="burst absolute -top-2 -right-2 grid size-20 rotate-12 place-items-center bg-c3 text-center font-display text-ink text-base leading-none sm:size-28 sm:text-xl"
      >
        NEW
        <br />
        TODAY!
      </span>
      <p className="kicker pr-16 text-on-c1! sm:pr-0">{dayLabel} · resets at midnight IST</p>
      <h2 id="qz-daily" className="h-display ink-text pr-14 text-4xl text-c3 sm:pr-0 sm:text-6xl">
        Daily Challenge
      </h2>
      {open ? (
        <>
          <p className="mt-2 font-head text-lg">{resumeLine(open)}</p>
          <Link to={playHref({ mode: 'daily' })} className="btn btn-c3 mt-3 px-7 text-xl">
            <IconBolt className="size-5" /> Resume your daily
          </Link>
        </>
      ) : usedUp ? (
        <>
          <p className="mt-2 font-head text-lg">You've used today's daily starts. Back tomorrow!</p>
          <p className="mt-1 font-head text-sm" aria-live="off">
            {left === null ? 'A fresh set every midnight' : `New set in ${hhmm(left)}`}
          </p>
          <Link to="/quiz#universes" className="btn btn-c3 mt-3 px-7 text-xl">
            Play a universe quiz
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-lg max-sm:hidden">
            The same 10 questions for every fan, mixed across all five universes.{' '}
            {signedIn
              ? 'Your first go today is the one that ranks.'
              : 'Sign in first: guests play the daily as blind practice and never rank.'}
          </p>
          <p className="mt-2 font-head text-sm" aria-live="off">
            {left === null ? 'A fresh set every midnight' : `New set in ${hhmm(left)}`}
          </p>
          <Link to={playHref({ mode: 'daily' })} className="btn btn-c3 mt-3 px-7 text-xl">
            <IconBolt className="size-5" /> Play today's challenge
          </Link>
        </>
      )}
    </m.section>
  );
}

/* ── yesterday's answers ───────────────────────────────────────────────────────────────── */

/**
 * Yesterday's daily with every answer unlocked (they stay secret on the day itself). A native
 * <details>, so it is keyboard and screen-reader friendly with no script at all.
 */
export function YesterdayAnswers({
  archive,
  palettes,
}: {
  archive: DailyArchive;
  palettes: Record<string, [string, string, string]>;
}) {
  const day = dayLabelOf(archive.day);
  return (
    <section id="yesterday" aria-labelledby="qz-yest" className="mb-4 scroll-mt-24 sm:mb-6">
      <details className="panel group">
        <summary className="qz-hit flex cursor-pointer list-none items-center gap-3 p-2.5 sm:p-4 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-skin-s border-[3px] border-line bg-c3 font-display text-on-c3 text-xl transition-transform group-open:rotate-90"
          >
            {'>'}
          </span>
          <span className="min-w-0">
            <span className="kicker block">Unlocked · {day}</span>
            <span id="qz-yest" className="h-display block text-2xl text-c1-text sm:text-4xl">
              Yesterday's answers
            </span>
            <span className="block text-muted text-sm max-sm:hidden">
              Missed one? See all ten, with the why and a source.
            </span>
          </span>
        </summary>
        <ol className="list-none space-y-3 border-line border-t-[3px] border-dashed p-4">
          {archive.questions.map((q, i) => {
            const link = /^https?:\/\//i.test(q.source) ? q.source : null;
            return (
              <li
                key={q.q}
                className="panel bg-bg! p-3"
                style={
                  palettes[q.character.slug]
                    ? pal(palettes[q.character.slug] as [string, string, string])
                    : undefined
                }
              >
                <p className="mb-1 flex flex-wrap items-center gap-2 font-head text-xs uppercase tracking-wider">
                  <span className="round border-2 border-line bg-c1 px-2 py-0.5 text-on-c1">
                    {i + 1}. {q.character.name}
                  </span>
                  <span className="text-muted">{UNIVERSE_LABEL[q.character.universe]}</span>
                  {q.fansRight !== null && (
                    <span className="ml-auto text-muted">
                      {Math.round(q.fansRight)}% of fans got it
                    </span>
                  )}
                </p>
                <p className="font-head">{q.q}</p>
                <p className="mt-1 flex items-start gap-2">
                  <span
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border-2 border-line px-1.5 font-display text-ink text-lg"
                    style={{ background: 'var(--qz-ok)' }}
                  >
                    <IconCheck className="size-3.5" />
                    Answer
                  </span>
                  <strong>{q.options[q.answer]}</strong>
                </p>
                <p className="mt-1 text-sm">{q.why}</p>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="qz-hit mt-1 inline-flex items-center text-sm underline underline-offset-2"
                  >
                    Source<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}

/* ── universes ─────────────────────────────────────────────────────────────────────────── */

const UNI: Record<PublishedUniverse, { word: string; pal: [string, string, string] }> = {
  marvel: { word: 'POW!', pal: ['#e43a3a', '#1b1620', '#ffd400'] },
  dc: { word: 'BAM!', pal: ['#2f6fe4', '#0a1a44', '#ffe14d'] },
  indian: { word: 'BOOM!', pal: ['#ff8a1f', '#0f5c2e', '#fff3d6'] },
  anime: { word: 'SUGOI!', pal: ['#ff4fa3', '#2b1b5e', '#7df9ff'] },
  other: { word: 'WHAM!', pal: ['#19b3a6', '#1e2a38', '#ff9f43'] },
};

export function UniverseCards({ counts }: { counts: Record<PublishedUniverse, number> }) {
  const mo = useSkinMotion();
  const animate = useAnimate();
  // Ink outlines rescue a yellow word on a coloured tile only where the skin draws dark ink (comic).
  const inked = useSkin().spec.surfaces === 'character';
  return (
    <section id="universes" aria-labelledby="qz-uni" className="mb-4 scroll-mt-24 sm:mb-10">
      <p className="kicker max-sm:hidden">Pick a universe</p>
      <h2 id="qz-uni" className="h-display ink-text mb-3 text-3xl text-c1-text sm:mb-5 sm:text-5xl">
        Ten from one world
      </h2>
      <ul className="grid list-none gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {PUBLISHED_UNIVERSES.map((u, i) => {
          const c = UNI[u];
          return (
            <m.li
              key={u}
              initial={animate ? { y: 36, rotate: i % 2 ? 2 : -2 } : false}
              whileInView={{ y: 0, rotate: i % 2 ? 0.8 : -0.8 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={mo.spring({ stiffness: 260, damping: 18 }, mo.delay(i % 3, 0.06))}
              whileHover={{ y: -6, rotate: i % 2 ? -1.5 : 1.5 }}
            >
              <Link
                to={playHref({ mode: 'universe', universe: u })}
                style={pal(c.pal)}
                className="panel-c1 halftone group relative flex min-h-[3.6rem] transition-transform active:scale-[0.97] flex-row items-center gap-3 overflow-hidden px-3 py-1 hover:shadow-ink-lg sm:min-h-44 sm:flex-col sm:items-stretch sm:justify-between sm:p-4"
              >
                <span
                  aria-hidden
                  className="absolute -right-2 -bottom-6 hidden font-display text-[9rem] leading-none opacity-20 sm:block"
                >
                  {UNIVERSE_LABEL[u][0]}
                </span>
                <span
                  aria-hidden
                  className={`min-w-[5.5rem] shrink-0 font-display text-3xl sm:min-w-0 sm:text-5xl ${inked ? 'ink-text' : ''}`}
                  // The word is the tile's accent on the tile's colour; where that pair is under 3:1 it takes
                  // the tile's own on-colour instead (a skin without ink shadows has nothing to rescue it).
                  style={{
                    color:
                      inked && contrast(c.pal[2], c.pal[0]) >= 3 ? 'var(--c3)' : 'var(--on-c1)',
                  }}
                >
                  {c.word}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block font-head text-lg leading-tight sm:text-2xl">
                    {UNIVERSE_LABEL[u]}
                  </span>
                  <span className="block text-xs sm:text-sm">
                    {counts[u]} characters · 10 questions
                  </span>
                </span>
                <span className="btn btn-sm btn-c3 relative shrink-0 sm:mt-3 sm:w-fit">
                  <span className="sm:hidden">Play</span>
                  <span className="max-sm:hidden">Play {UNIVERSE_LABEL[u]}</span>
                </span>
              </Link>
            </m.li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── character picker ──────────────────────────────────────────────────────────────────── */

export function CharacterPicker({
  roster,
  popular,
}: {
  roster: RosterRow[];
  /** Slugs of the best-known characters, shown as one-tap chips. */
  popular: string[];
}) {
  const [q, setQ] = useState('');
  const [u, setU] = useState<PublishedUniverse | 'all'>('all');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const bySlug = useMemo(() => new Map(roster.map((r) => [r.slug, r])), [roster]);
  const rows = useMemo(
    () =>
      roster.filter(
        (r) => (u === 'all' || r.universe === u) && (!dq || r.name.toLowerCase().includes(dq)),
      ),
    [roster, dq, u],
  );
  const tile = (r: RosterRow) => (
    <li key={r.slug} className="[contain-intrinsic-size:auto_76px] [content-visibility:auto]">
      <Link
        to={playHref({ mode: 'character', character: r.slug })}
        style={pal(r.palette)}
        className="panel group flex h-full min-h-[4.5rem] flex-col justify-center border-l-[10px] border-l-c1 px-3 py-2 transition-transform hover:-translate-y-1 hover:-rotate-1 hover:shadow-ink"
      >
        <span className="font-display text-xl leading-tight">{r.name}</span>
        <span className="font-head text-[0.7rem] text-muted uppercase tracking-wider">
          {UNIVERSE_LABEL[r.universe]}
        </span>
      </Link>
    </li>
  );
  return (
    <section aria-labelledby="qz-pick" className="mb-4 sm:mb-10">
      <p className="kicker max-sm:hidden">Know one hero inside out?</p>
      <h2
        id="qz-pick"
        className="h-display ink-text mb-2 text-2xl text-c1-text sm:mb-3 sm:text-5xl"
      >
        Pick a character
      </h2>
      <div className="panel mb-3 space-y-3 p-3 sm:p-4">
        <label className="relative block">
          <span className="sr-only">Search characters</span>
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-5 text-muted" />
          <input
            type="search"
            className="field pl-10"
            placeholder={`Search ${roster.length} characters`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        {!dq && (
          <ul
            className="flex list-none flex-wrap gap-2 max-sm:[&>li:nth-child(n+7)]:hidden"
            aria-label="Popular characters"
          >
            {popular.map((slug) => {
              const r = bySlug.get(slug);
              return r ? (
                <li key={slug}>
                  <Link
                    to={playHref({ mode: 'character', character: slug })}
                    className="chip no-underline"
                    style={pal(r.palette)}
                  >
                    {r.name}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        )}
        {dq && (
          <p role="status" className="text-muted text-sm">
            {rows.length === 0
              ? 'No one by that name. Try a shorter search.'
              : `${rows.length} character${rows.length === 1 ? '' : 's'}`}
          </p>
        )}
      </div>
      {dq ? (
        <ul className="grid list-none grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map(tile)}
        </ul>
      ) : (
        <details className="panel group">
          <summary className="qz-hit flex cursor-pointer list-none items-center gap-3 p-3 font-head [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-skin-s border-[3px] border-line bg-c3 font-display text-on-c3 transition-transform group-open:rotate-90"
            >
              {'>'}
            </span>
            Browse all {roster.length} characters
          </summary>
          <div className="space-y-3 border-line border-t-[3px] border-dashed p-3">
            <fieldset className="flex min-w-0 flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">Filter by universe</legend>
              {(['all', ...PUBLISHED_UNIVERSES] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={u === id}
                  onClick={() => setU(id)}
                >
                  {id === 'all' ? 'All' : UNIVERSE_LABEL[id]}
                </button>
              ))}
            </fieldset>
            <ul className="grid list-none grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {rows.map(tile)}
            </ul>
          </div>
        </details>
      )}
    </section>
  );
}

/* ── how it works ──────────────────────────────────────────────────────────────────────── */

export function HowItWorks() {
  return (
    <details className="mb-1 text-center text-sm">
      <summary className="qz-hit mx-auto inline-flex cursor-pointer items-center underline underline-offset-2">
        How scoring works
      </summary>
      <div className="mx-auto mt-2 max-w-xl space-y-1 text-left">
        <p>
          <strong>Lock in:</strong> tap an answer or press 1-4. You get 15 seconds, and faster means
          more points.
        </p>
        <p>
          <strong>Points:</strong> a right answer is 100 plus a speed bonus, times 1, 1.5 or 2 for
          harder questions, plus 25 for every answer past a streak of two.
        </p>
        <p>
          <strong>Learn:</strong> every answer shows why, a source and how many fans got it. Spot a
          mistake? Tell us.
        </p>
      </div>
    </details>
  );
}
