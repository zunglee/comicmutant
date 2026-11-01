/**
 * /quiz/leaders — Fact Frenzy boards: today's daily, best universe games (all-time or this week), and
 * facts known. The tab, universe and window live in the URL so every view deep-links.
 */
import { m } from 'motion/react';
import { Link } from 'react-router';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { istDay } from '~/.server/freefall';
import { board } from '~/.server/quiz';
import { SectionHead } from '~/components/bits';
import { useNoDock } from '~/components/quiz/useNoDock';
import { Podium, RankedList, type Unit } from '~/components/quiz-data/board';
import { universeName } from '~/components/quiz-data/format';
import { useAnimate } from '~/lib/fx';
import type { BoardId, BoardRow } from '~/lib/quiz-contract';
import { PUBLISHED_UNIVERSES, type PublishedUniverse } from '~/lib/taxonomy';
import type { Route } from './+types/quiz-leaders';

export const meta: Route.MetaFunction = () => [
  { title: 'Fact Frenzy leaderboards — ComicMutant' },
  {
    name: 'description',
    content:
      "Today's Fact Frenzy daily board, the best score in every comic universe, and the fans who know the most facts first try.",
  },
];

const TABS = [
  { id: 'daily', label: 'Daily' },
  { id: 'universe', label: 'Universe best' },
  { id: 'facts', label: 'Facts known (first try)' },
] as const satisfies readonly { id: BoardId; label: string }[];

const SHOWN = 50;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const rawTab = url.searchParams.get('tab');
  const tab: BoardId = TABS.some((t) => t.id === rawTab) ? (rawTab as BoardId) : 'daily';
  const rawU = url.searchParams.get('u');
  const universe: PublishedUniverse =
    PUBLISHED_UNIVERSES.find((u) => u === rawU) ?? PUBLISHED_UNIVERSES[0];
  const win: 'all' | 'week' = url.searchParams.get('w') === 'week' ? 'week' : 'all';

  const sql = await getSql();
  const user = await currentUser(sql, request);
  const data = await board(
    sql,
    tab,
    tab === 'universe' ? { universe, window: win } : {},
    user?.id ?? null,
  );
  // The facts board's own count is the value; repeating it as the detail line is noise.
  const plain = (r: BoardRow): BoardRow => (tab === 'facts' ? { ...r, detail: '' } : r);
  return {
    tab,
    universe,
    win,
    day: istDay(),
    signedIn: !!user,
    rows: data.rows.slice(0, SHOWN).map(plain),
    total: data.total,
    you: data.you ? plain(data.you) : null,
  };
}

function href(tab: BoardId, universe: PublishedUniverse, win: 'all' | 'week'): string {
  const q = new URLSearchParams({ tab });
  if (tab === 'universe') {
    q.set('u', universe);
    q.set('w', win);
  }
  return `?${q}`;
}

function playHref(tab: BoardId, universe: PublishedUniverse): string {
  return tab === 'universe' ? `/quiz/play?mode=universe&u=${universe}` : '/quiz/play?mode=daily';
}

export default function QuizLeaders({ loaderData: d }: Route.ComponentProps) {
  const animate = useAnimate();
  // The floating theme dock would sit over the podium numbers on a phone.
  useNoDock();
  const unit: Unit = d.tab === 'facts' ? (['fact', 'facts'] as const) : (['pt', 'pts'] as const);
  const heading =
    d.tab === 'daily'
      ? `Today's daily · ${d.day}`
      : d.tab === 'universe'
        ? `${universeName(d.universe)} · ${d.win === 'week' ? 'best this week' : 'best of all time'}`
        : 'Facts known (first try)';
  const sub =
    d.tab === 'daily'
      ? 'First attempt of the day counts. Ties go to the faster fan. New questions at midnight IST.'
      : d.tab === 'universe'
        ? "Each fan's single best ten-question game in this universe."
        : 'Replaying the same quiz can’t farm this one: every fact counts once.';
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-28">
      <SectionHead
        level={1}
        kicker="Fact Frenzy"
        title="Leaderboards"
        action={
          <Link to="/quiz" className="btn btn-sm">
            Back to the quiz
          </Link>
        }
      />

      <nav aria-label="Leaderboard" className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={href(t.id, d.universe, d.win)}
            preventScrollReset
            className="chip min-h-11"
            aria-current={t.id === d.tab ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {d.tab === 'universe' && (
        <div className="mb-3 space-y-2">
          <nav aria-label="Universe" className="flex flex-wrap gap-2">
            {PUBLISHED_UNIVERSES.map((u) => (
              <Link
                key={u}
                to={href('universe', u, d.win)}
                preventScrollReset
                className="chip min-h-11"
                aria-current={u === d.universe ? 'page' : undefined}
              >
                {universeName(u)}
              </Link>
            ))}
          </nav>
          <nav aria-label="Time window" className="flex flex-wrap gap-2">
            {(
              [
                ['all', 'All time'],
                ['week', 'This week'],
              ] as const
            ).map(([w, label]) => (
              <Link
                key={w}
                to={href('universe', d.universe, w)}
                preventScrollReset
                className="chip min-h-11"
                aria-current={w === d.win ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <section aria-labelledby="board-title" className="mt-6">
        <h2 id="board-title" className="h-head text-2xl">
          {heading}
        </h2>
        <p className="mb-5 text-muted text-sm">
          {sub} · {d.total} {d.total === 1 ? 'fan' : 'fans'} on this board
        </p>

        {d.rows.length === 0 ? (
          <m.div
            className="panel p-6 text-center"
            initial={animate ? { y: 24, scale: 0.97 } : false}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20 }}
          >
            <p className="h-display text-4xl">The podium is empty</p>
            <p className="mx-auto mt-2 mb-4 max-w-md">
              {d.tab === 'daily'
                ? "Nobody has finished today's daily yet. Ten questions, one go: take first place."
                : d.tab === 'universe'
                  ? `No ${universeName(d.universe)} games ${d.win === 'week' ? 'this week' : 'yet'}. Play one and your score is the one to beat.`
                  : 'Nobody has a fact on the board yet. Get one right the first time you see it and you are up here.'}
            </p>
            <Link to={playHref(d.tab, d.universe)} className="btn btn-c1">
              {d.tab === 'universe' ? `Play ${universeName(d.universe)}` : 'Play the daily'}
            </Link>
          </m.div>
        ) : (
          <>
            <Podium rows={d.rows} unit={unit} />
            <RankedList rows={d.rows} you={d.you} unit={unit} />
          </>
        )}

        {d.rows.length > 0 && d.rows.length < 3 && (
          <p className="mt-4 text-sm">
            Room on the podium.{' '}
            <Link to={playHref(d.tab, d.universe)} className="underline">
              Play a game
            </Link>{' '}
            and take a spot.
          </p>
        )}

        {!d.signedIn ? (
          <p className="bubble mt-8">
            Only signed-in fans reach the boards, and a daily started as a guest never ranks.{' '}
            <Link to="/join?next=/quiz/leaders" className="font-semibold underline">
              Pick a nickname
            </Link>{' '}
            (no email needed) before you play to count.
          </p>
        ) : (
          !d.you &&
          d.rows.length > 0 && (
            <p className="mt-6 text-sm">
              You are not on this board yet.{' '}
              <Link to={playHref(d.tab, d.universe)} className="underline">
                Play to get on it
              </Link>
              .
            </p>
          )
        )}
      </section>
    </div>
  );
}
