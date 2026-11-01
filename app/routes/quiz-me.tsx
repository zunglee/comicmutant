/**
 * /quiz/me — a fan's own Fact Frenzy analytics: a trading-card header, accuracy by universe, topic and
 * difficulty, the weakest characters (with practise links) and the last ten games.
 */
import { m } from 'motion/react';
import { Link } from 'react-router';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { fanStats } from '~/.server/quiz';
import { SectionHead } from '~/components/bits';
import { useNoDock } from '~/components/quiz/useNoDock';
import { type BarItem, BarList } from '~/components/quiz-data/bar-list';
import {
  DIFFICULTY_LABEL,
  MODE_LABEL,
  nf,
  pct,
  shortDate,
  topicName,
  universeName,
} from '~/components/quiz-data/format';
import { useAnimate } from '~/lib/fx';
import type { FanStats } from '~/lib/quiz-contract';
import type { Route } from './+types/quiz-me';

export const meta: Route.MetaFunction = () => [
  { title: 'My Fact Frenzy stats — ComicMutant' },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }: Route.LoaderArgs) {
  const sql = await getSql();
  const user = await currentUser(sql, request);
  if (!user) return { signedIn: false as const };
  return { signedIn: true as const, name: user.name, stats: await fanStats(sql, user.id) };
}

/** A playful title for the card, earned by facts known. */
function fanTitle(n: number): string {
  if (n >= 500) return 'Archivist of the multiverse';
  if (n >= 250) return 'Lore keeper';
  if (n >= 100) return 'Trivia vigilante';
  if (n >= 25) return 'Panel scholar';
  if (n >= 1) return 'Rookie sidekick';
  return 'Fresh recruit';
}

const MIN_ANSWERS = 5;
const RULE = `Labels need ${MIN_ANSWERS}+ answers on a row and one clear high or low. Greyed rows have fewer, so they are not compared.`;

/**
 * Tag a strongest and a weakest row, but only from rows with enough answers to mean something, and
 * only when each is the one clear maximum or minimum: a tie or a thin sample earns no label.
 */
function withExtremes(items: BarItem[], answered: number[]): BarItem[] {
  const ok = items.map((_, i) => i).filter((i) => (answered[i] ?? 0) >= MIN_ANSWERS);
  if (ok.length < 2) return items;
  const vals = ok.map((i) => items[i]?.value ?? 0);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  if (hi === lo) return items;
  const best = ok.filter((i) => items[i]?.value === hi);
  const worst = ok.filter((i) => items[i]?.value === lo);
  const bestAt = best.length === 1 ? best[0] : -1;
  const worstAt = worst.length === 1 ? worst[0] : -1;
  return items.map((it, n) =>
    n === bestAt
      ? { ...it, tag: 'your strongest' }
      : n === worstAt
        ? { ...it, tag: 'your weakest' }
        : it,
  );
}

export default function QuizMe({ loaderData: d }: Route.ComponentProps) {
  // The floating theme dock would sit over the rank pills and the cards on a phone.
  useNoDock();
  if (!d.signedIn) return <Guest />;
  return <Signed name={d.name} s={d.stats} />;
}

function Guest() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 pb-28">
      <SectionHead level={1} kicker="Fact Frenzy" title="My stats" />
      <div className="panel p-6 text-center">
        <p className="h-display text-4xl">Your fan card is waiting</p>
        <p className="mx-auto mt-3 mb-5 max-w-md">
          Join with just a nickname (no email) and we keep your score, your streaks, your strongest
          universes and the characters you should swot up on.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/join?next=/quiz/me" className="btn btn-c1">
            Join and start your card
          </Link>
          <Link to="/login?next=/quiz/me" className="btn">
            I already have a nickname
          </Link>
        </div>
        <p className="mt-5 text-muted text-sm">
          Not ready?{' '}
          <Link to="/quiz/play?mode=daily" className="underline">
            Play as a guest
          </Link>
          : you can claim that game after you join.
        </p>
      </div>
    </div>
  );
}

function Signed({ name, s }: { name: string; s: FanStats }) {
  const animate = useAnimate();
  const share = s.bankSize > 0 ? Math.min(1, s.factsMastered / s.bankSize) : 0;
  const noGames = s.games === 0;
  const hasRecent = s.recent.length > 0;
  const held = s.recent.filter((g) => g.held).length;
  const byUniverse = withExtremes(
    s.byUniverse.map((u) => ({
      key: u.universe,
      label: universeName(u.universe),
      value: u.accuracy,
      display: pct(u.accuracy),
      sub: `${nf.format(u.answered)} answered`,
      dim: u.answered < MIN_ANSWERS,
    })),
    s.byUniverse.map((u) => u.answered),
  );
  const byTopic = withExtremes(
    s.byTopic.map((t) => ({
      key: t.topic,
      label: topicName(t.topic),
      value: t.accuracy,
      display: pct(t.accuracy),
      sub: `${nf.format(t.answered)} answered`,
      dim: t.answered < MIN_ANSWERS,
    })),
    s.byTopic.map((t) => t.answered),
  );
  const byDifficulty = s.byDifficulty.map((x) => ({
    key: String(x.difficulty),
    label: DIFFICULTY_LABEL[x.difficulty],
    value: x.accuracy,
    display: pct(x.accuracy),
    sub: `${nf.format(x.answered)} answered`,
    dim: x.answered < MIN_ANSWERS,
  }));
  const tiles: [string, string][] = [
    ['Accuracy', pct(s.accuracy)],
    ['Best streak', nf.format(s.bestStreak)],
    ['Games', nf.format(s.games)],
    ['Avg answer (sec)', s.avgSeconds.toFixed(1)],
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 pb-28">
      <SectionHead
        level={1}
        kicker="Fact Frenzy"
        title="My stats"
        action={
          <Link to="/quiz/leaders" className="btn btn-sm">
            Leaderboards
          </Link>
        }
      />

      <m.section
        aria-labelledby="fan-card"
        className="panel-c1 halftone relative mb-8 p-5 sm:p-7"
        initial={animate ? { y: 40, rotate: -2 } : false}
        animate={{ y: 0, rotate: -0.6 }}
        transition={{ type: 'spring', stiffness: 220, damping: 15 }}
      >
        <p className="h-head text-xs uppercase tracking-widest">{fanTitle(s.factsMastered)}</p>
        <h2 id="fan-card" className="h-display break-words text-5xl text-on-c1 sm:text-6xl">
          {name}
        </h2>

        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="font-semibold">Facts known</span>
            <span className="h-head tabular-nums">
              {nf.format(s.factsMastered)} / {nf.format(s.bankSize)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Facts known"
            aria-valuemin={0}
            aria-valuemax={s.bankSize}
            aria-valuenow={s.factsMastered}
            aria-valuetext={`${s.factsMastered} of ${s.bankSize} facts known`}
            className="h-5 overflow-hidden rounded border-3 border-line bg-bg"
          >
            <m.div
              className="h-full origin-left border-line border-r-3 bg-c3"
              style={{ width: `${share * 100}%`, minWidth: share > 0 ? 6 : 0 }}
              initial={animate ? { scaleX: 0 } : false}
              animate={{ scaleX: 1 }}
              transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.25 }}
            />
          </div>
          <p className="mt-1 text-xs opacity-90">
            {share >= 1
              ? 'Every fact in the bank. Legend.'
              : `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}% of the bank. A fact counts when you get it right the first time you see it.`}
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([k, v], i) => (
            <m.div
              key={k}
              className="rounded border-3 border-line bg-card p-3 text-card-fg"
              initial={animate ? { y: 20, scale: 0.9 } : false}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 + i * 0.07 }}
            >
              <dt className="text-muted text-xs uppercase tracking-wide">{k}</dt>
              <dd className="h-display text-3xl tabular-nums">{v}</dd>
            </m.div>
          ))}
        </dl>

        <p className="mt-3 text-xs opacity-90">
          Games counts finished games. Average answer time leaves out timeouts.
        </p>

        <p className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="chip pointer-events-none">
            Daily board: {s.ranks.daily ? `#${s.ranks.daily}` : 'not ranked today'}
          </span>
          <span className="chip pointer-events-none">
            Facts known board: {s.ranks.facts ? `#${s.ranks.facts}` : 'not ranked yet'}
          </span>
        </p>
      </m.section>

      {held > 0 && (
        <p role="status" className="bubble mb-6">
          {held} {held === 1 ? 'game is' : 'games are'} waiting for a quick check. A moderator is
          looking at the pace before {held === 1 ? 'it reaches' : 'they reach'} a board, and{' '}
          {held === 1 ? 'it stays' : 'they stay'} out of the charts until then.
        </p>
      )}

      {noGames && !hasRecent && (
        <div className="panel p-6 text-center">
          <p className="h-display text-4xl">No games yet</p>
          <p className="mx-auto mt-2 mb-4 max-w-md">
            Play your first ten questions and your charts fill in: accuracy by universe, topic and
            difficulty, plus the characters to practise.
          </p>
          <Link to="/quiz" className="btn btn-c1">
            Pick a quiz
          </Link>
        </div>
      )}

      {!noGames && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="by-universe" className="panel p-4 sm:p-5">
              <h2 id="by-universe" className="h-head mb-3 text-xl">
                Accuracy by universe
              </h2>
              <p className="-mt-2 mb-3 text-muted text-xs">{RULE}</p>
              <BarList items={byUniverse} tone="c1" empty="Play a universe quiz to see this." />
            </section>
            <section aria-labelledby="by-difficulty" className="panel p-4 sm:p-5">
              <h2 id="by-difficulty" className="h-head mb-3 text-xl">
                Accuracy by difficulty
              </h2>
              <BarList items={byDifficulty} tone="c3" empty="No answers yet." />
            </section>
            <section aria-labelledby="by-topic" className="panel p-4 sm:p-5 md:col-span-2">
              <h2 id="by-topic" className="h-head mb-3 text-xl">
                Accuracy by topic
              </h2>
              <p className="-mt-2 mb-3 text-muted text-xs">{RULE}</p>
              <BarList
                items={byTopic}
                tone="c2"
                empty="Topics appear after a few answers."
                className="md:grid md:grid-cols-2 md:gap-x-8 md:space-y-0 md:gap-y-3"
              />
            </section>
          </div>

          <section aria-labelledby="weakest" className="mt-8">
            <h2 id="weakest" className="h-head mb-1 text-2xl">
              Weakest characters
            </h2>
            <p className="mb-3 text-muted text-sm">
              Characters under 70% right, at least three answers each, weakest first.
            </p>
            {s.weakest.length === 0 ? (
              <div className="panel p-5">
                <p className="h-head text-xl">No weak spots yet</p>
                <p className="mt-1 text-sm">
                  Every character you have answered three or more on is at 70% or better. Keep
                  playing: a character that trips you up will land here with a practise link.
                </p>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {s.weakest.map((w) => (
                  <li key={w.slug} className="panel flex items-center gap-3 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{w.name}</span>
                      <span className="text-muted text-xs">
                        {pct(w.accuracy)} right · {nf.format(w.answered)} answered
                      </span>
                    </span>
                    <Link
                      to={`/quiz/play?mode=character&c=${encodeURIComponent(w.slug)}`}
                      className="btn btn-sm btn-c3"
                      aria-label={`Practise ${w.name}`}
                    >
                      Practise
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {hasRecent && (
        <section aria-labelledby="recent" className="mt-8">
          <h2 id="recent" className="h-head mb-3 text-2xl">
            Recent games
          </h2>
          <ul className="space-y-2">
            {s.recent.map((g, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: two games can share a timestamp.
                key={`${g.at}-${i}`}
                className="panel flex items-start gap-3 p-3"
              >
                <span className="w-14 shrink-0 pt-0.5 text-muted text-sm">{shortDate(g.at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{g.label}</span>
                  <span className="text-muted text-xs">
                    {MODE_LABEL[g.mode]} · {g.correct}/{g.total} right
                  </span>
                  {g.held && (
                    <span className="mt-1 block text-sm">
                      <span className="chip pointer-events-none mr-2">Held</span>
                      That pace looked very quick, so a moderator is taking a look before it reaches
                      a board.
                    </span>
                  )}
                </span>
                <span className="h-head shrink-0 text-right tabular-nums">
                  {nf.format(g.score)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
