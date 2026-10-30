/**
 * /arena/:game — one match. The loader validates the query and ships both fighters (and, for
 * the quiz, a shuffled pool of questions that each Start samples from). The game itself is a
 * client-only lazy chunk per game.
 */
import { type ComponentType, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { data, Link, redirect, type ShouldRevalidateFunctionArgs, useFetcher } from 'react-router';
import { z } from 'zod';
import { getFighter, quizPool } from '~/.server/content';
import { shuffle } from '~/game/engine/math';
import { POOL_SIZE } from '~/game/quiz/logic';
import { saveResult } from '~/game/records';
import {
  GAME_IDS,
  GAME_TITLES,
  type GameId,
  type GameProps,
  type GameResult,
  type QuizQ,
} from '~/game/types';
import type { Route } from './+types/arena-play';

const GAMES: Record<GameId, React.LazyExoticComponent<ComponentType<GameProps>>> = {
  fight: lazy(() => import('~/game/fight/FightGame')),
  badminton: lazy(() => import('~/game/badminton/BadmintonGame')),
  football: lazy(() => import('~/game/football/FootballGame')),
  quiz: lazy(() => import('~/game/quiz/QuizGame')),
};

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(60);
const Query = z.object({
  p1: slug,
  p2: slug,
  vs: z.enum(['cpu', 'local']).catch('cpu'),
  d: z.enum(['easy', 'normal', 'hard']).catch('normal'),
});

/** A score post must not re-run the loader (it would reshuffle the quiz questions mid-game). */
export function shouldRevalidate({
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formAction === '/api/score' ? false : defaultShouldRevalidate;
}

export function loader({ params, request }: Route.LoaderArgs) {
  const game = z.enum(GAME_IDS).safeParse(params.game);
  if (!game.success) throw data('No such game', { status: 404 });
  const url = new URL(request.url);
  const q = Query.safeParse(Object.fromEntries(url.searchParams));
  const p1 = q.success ? getFighter(q.data.p1) : undefined;
  const p2 = q.success ? getFighter(q.data.p2) : undefined;
  if (!q.success || !p1 || !p2) throw redirect(`/arena?game=${game.data}`);
  let questions: QuizQ[] | undefined;
  if (game.data === 'quiz') {
    // A pool of POOL_SIZE (one per character where possible); each Start samples QUESTIONS of it
    // and shuffles their options, so a replay asks new questions.
    const seen = new Set<string>();
    const mixed = shuffle(quizPool());
    const firsts = mixed.filter((x) => !seen.has(x.slug) && !!seen.add(x.slug));
    const picked = [...firsts, ...mixed.filter((x) => !firsts.includes(x))].slice(0, POOL_SIZE);
    questions = picked.map(({ q: text, options, answer, why, name }) => ({
      q: text,
      options,
      answer,
      why,
      name,
    }));
  }
  return { game: game.data, p1, p2, vs: q.data.vs, difficulty: q.data.d, questions };
}

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [{ title: 'Arena — ComicMutant' }];
  const title = `${GAME_TITLES[d.game]}: ${d.p1.alias} vs ${d.p2.alias} — ComicMutant Arena`;
  return [
    { title },
    {
      name: 'description',
      content: `Play ${GAME_TITLES[d.game]} as ${d.p1.alias} against ${d.p2.alias}. A free browser mini-game starring ComicMutant originals.`,
    },
    { name: 'robots', content: 'noindex' },
  ];
};

export default function ArenaPlay({ loaderData: d }: Route.ComponentProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fetcher = useFetcher();
  const Game = GAMES[d.game];
  const { submit } = fetcher;
  const onEnd = useCallback(
    (r: GameResult) => {
      saveResult(r, d.p1.slug, d.p2.slug);
      submit(
        { game: r.game, p1: d.p1.slug, p2: d.p2.slug, winner: r.winner, score: r.score },
        { method: 'post', action: '/api/score', encType: 'application/json' },
      );
    },
    [d.p1.slug, d.p2.slug, submit],
  );
  return (
    <div className="mx-auto max-w-6xl px-2 py-3 sm:px-4 sm:py-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2">
        <div>
          <p className="kicker">
            The Arena · {d.vs === 'cpu' ? `vs CPU (${d.difficulty})` : 'local 2-player'}
          </p>
          <h1 className="h-display text-3xl sm:text-4xl">
            <span className="text-c1-text">{d.p1.alias}</span>{' '}
            <span className="text-muted">vs</span>{' '}
            <span className="text-c3-text">{d.p2.alias}</span>
          </h1>
        </div>
        <Link to={`/arena?game=${d.game}&p1=${d.p1.slug}&p2=${d.p2.slug}`} className="btn btn-sm">
          ← Arena
        </Link>
      </div>
      {mounted ? (
        <Suspense fallback={<Loading title={GAME_TITLES[d.game]} />}>
          <Game
            key={`${d.game}|${d.p1.slug}|${d.p2.slug}|${d.vs}|${d.difficulty}`}
            p1={d.p1}
            p2={d.p2}
            vs={d.vs}
            difficulty={d.difficulty}
            questions={d.questions}
            onEnd={onEnd}
          />
        </Suspense>
      ) : (
        <Loading title={GAME_TITLES[d.game]} />
      )}
    </div>
  );
}

/** Same reserved 16:9 box as the game, so nothing shifts when the chunk arrives. */
function Loading({ title }: { title: string }) {
  return (
    <div
      className="panel halftone mx-auto flex items-center justify-center"
      style={{ aspectRatio: '16 / 9', width: 'min(100%, calc((100dvh - 6.5rem) * 16 / 9))' }}
      role="status"
    >
      <p className="h-display text-3xl text-c3-text">Loading {title}…</p>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="h-display mb-4 text-5xl">No such game</h1>
      <p className="mb-6">That arena doesn't exist (yet). Pick one of ours.</p>
      <Link to="/arena" className="btn btn-c1">
        Back to the Arena
      </Link>
    </div>
  );
}
