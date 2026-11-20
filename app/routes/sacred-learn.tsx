/**
 * /sacred/learn — the kids' Learning Garden: six calm, knowledge-based games over the Sacred India
 * figures. Progress lives only in this browser; nothing here ranks or shares a child's results.
 * Each game is its own lazy chunk and opens only when chosen.
 */
import { lazy, Suspense, useRef } from 'react';
import { data, Link, useSearchParams } from 'react-router';
import { ensureGuest } from '~/.server/polls';
import type { DeckFact, PollView, Realm } from '~/components/learn/contract';
import { FactDeck } from '~/components/learn/fact-deck';
import { gameFigures, learnAvailability } from '~/components/learn/games/data.server';
import { type GameId, isGameId } from '~/components/learn/games/logic';
import {
  Diya,
  Icon,
  type IconName,
  LearnStyles,
  useFocusEffect,
} from '~/components/learn/games/shared';
import type { GameProps } from '~/components/learn/games/types';
import { MiniQuiz } from '~/components/learn/mini-quiz';
import { PollCard } from '~/components/learn/poll-card';
import { StoryWalk } from '~/components/learn/story-walk';
import { SACRED_FONT_LINKS } from '~/components/sacred/fonts';
import type { Route } from './+types/sacred-learn';

/** Preload the realm faces (as every Sacred route does) so text does not reflow when they arrive. */
export const links: Route.LinksFunction = () => SACRED_FONT_LINKS;

export const meta: Route.MetaFunction = () => [
  { title: 'The Learning Garden: games on India’s sacred stories for kids — ComicMutant' },
  {
    name: 'description',
    content:
      'Calm learning games for kids on the stories of Hindu, Buddhist, Jain and Sikh figures: match symbols, turn the Dashavatara wheel, walk the path of the ten Gurus, and grow a fact garden.',
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const fixture = url.searchParams.get('fixture') === '1';
  const avail = learnAvailability({ fixture });
  const g = url.searchParams.get('game');
  // The hub ships only flags; a game's data loads with that game (?game=<id>).
  const game = isGameId(g) && avail[g] ? g : null;
  const figures = game ? gameFigures(game, { fixture }) : [];
  // Server-side only: have the game's module ready so SSR renders the game itself, not a fallback
  // (no flash, no layout shift). The browser still loads the chunk lazily.
  if (game) ready[game] = (await GAMES[game].import()).default;
  // Fixture data exists only in dev / lab runs, so this preview switch cannot light up in production.
  const preview = fixture && Object.values(avail).some(Boolean);
  const headers = new Headers();
  // The preview shows a fact deck and a poll: issue the voter cookies they need before any POST.
  const w = url.searchParams.get('widget');
  if (preview && (w === 'deck' || w === 'poll')) await ensureGuest(request, headers);
  return data({ avail, game, figures, preview }, { headers });
}

/** Dev / e2e preview of the four widgets (?fixture=1&widget=deck|story|quiz|poll&realm=comic). */
const PREVIEW_FACTS: DeckFact[] = [1, 2, 3, 4, 5].map((n) => ({
  text: `Preview fact ${n}: a made-up sentence, long enough to read like a real fact card.`,
  kind: 'story',
  source: 'https://example.org/preview',
  interest: 10 - n,
  kid: n % 2 === 1,
}));
const PREVIEW_STEPS = [
  { title: 'The first lamp', text: 'Preview scene one: a small made-up story step for the walk.' },
  { title: 'The second lamp', text: 'Preview scene two: the story carries on, gently and slowly.' },
  { title: 'The last lamp', text: 'Preview scene three: and the lamps are all lit at the end.' },
];
const PREVIEW_QUIZ = [
  {
    q: 'Preview question one: which one is a lamp?',
    options: ['Diya', 'Stone', 'Cloud', 'Rope'],
    answer: 0,
    why: 'A diya is a small oil lamp lit at festivals.',
  },
  {
    q: 'Preview question two: which one is a flower?',
    options: ['Lotus', 'Brick', 'Spoon', 'Coin'],
    answer: 0,
    why: 'The lotus is a flower that grows in still water.',
  },
];
const PREVIEW_POLL: PollView = {
  id: 'preview',
  question: 'Which story would you like to read next?',
  options: [
    { id: 'a', label: 'The lamp story', votes: 6 },
    { id: 'b', label: 'The river story', votes: 3 },
  ],
  total: 9,
  mine: null,
};

const GAMES: Record<
  GameId,
  {
    title: string;
    blurb: string;
    icon: IconName;
    import: () => Promise<{ default: React.ComponentType<GameProps> }>;
  }
> = {
  symbols: {
    title: 'Symbol Match',
    blurb: 'Match each figure to its emblem or mount.',
    icon: 'flower',
    import: () => import('~/components/learn/games/symbol-match'),
  },
  wheel: {
    title: 'Dashavatara Wheel',
    blurb: 'Turn through the ten avatars and put them in order.',
    icon: 'ring',
    import: () => import('~/components/learn/games/dashavatara-wheel'),
  },
  gurus: {
    title: 'Path of the Ten Gurus',
    blurb: 'Follow the lamps, then guess who came next.',
    icon: 'lamp',
    import: () => import('~/components/learn/games/guru-path'),
  },
  tirthankaras: {
    title: 'The 24 Tirthankaras',
    blurb: 'Learn their symbols and play memory pairs.',
    icon: 'grid',
    import: () => import('~/components/learn/games/tirthankaras'),
  },
  garden: {
    title: 'Fact Garden',
    blurb: 'Answer a question, say whoa, and a flower grows.',
    icon: 'sprout',
    import: () => import('~/components/learn/games/fact-garden'),
  },
  whoami: {
    title: 'Who Am I?',
    blurb: 'Three clues, four guesses.',
    icon: 'question',
    import: () => import('~/components/learn/games/who-am-i'),
  },
};

const lazies = Object.fromEntries(
  (Object.keys(GAMES) as GameId[]).map((id) => [id, lazy(GAMES[id].import)]),
) as Record<GameId, React.LazyExoticComponent<React.ComponentType<GameProps>>>;
/** Filled by the loader on the server only; empty in the browser (which uses the lazy chunk). */
const ready: Partial<Record<GameId, React.ComponentType<GameProps>>> = {};

export default function SacredLearn({ loaderData }: Route.ComponentProps) {
  const { figures, avail } = loaderData;
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('game');
  const game = isGameId(raw) && loaderData.game === raw ? raw : null;
  const top = useRef<HTMLDivElement>(null);
  const lastGame = useRef<GameId | null>(null);
  useFocusEffect(() => {
    if (game) top.current?.focus({ preventScroll: false });
    // Back to the hub: the game's own button unmounted, so focus returns to its tile.
    else if (lastGame.current)
      document
        .querySelector<HTMLElement>(`[data-testid=tile-${lastGame.current}]`)
        ?.focus({ preventScroll: true });
    lastGame.current = game;
  }, [game]);

  const exit = () => {
    const n = new URLSearchParams(sp);
    n.delete('game');
    setSp(n, { preventScrollReset: true });
  };
  const open = (id: GameId) => {
    const n = new URLSearchParams(sp);
    n.set('game', id);
    setSp(n, { preventScrollReset: true });
  };
  const widget = loaderData.preview ? sp.get('widget') : null;
  const wr: Realm = sp.get('realm') === 'comic' ? 'comic' : 'sacred';
  const Game = game ? (ready[game] ?? lazies[game]) : null;

  return (
    <div className="lw relative" data-lw="sacred" style={{ color: 'var(--fg)', minHeight: '70vh' }}>
      <LearnStyles />
      <div className="mx-auto w-full max-w-4xl px-4 pt-8 pb-32 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link className="lw-link inline-flex min-h-11 items-center" to="/sacred">
            Sacred India
          </Link>
          <span aria-hidden> / </span>
          <span>Learning Garden</span>
        </nav>

        <header className="mb-8 flex items-center gap-4">
          <span className="lw-float shrink-0" aria-hidden>
            <Diya lit size={56} />
          </span>
          <div>
            <h1 className="lw-title text-4xl sm:text-5xl">The Learning Garden</h1>
            <p className="lw-muted mt-1 text-lg">
              Gentle games on the stories of India&rsquo;s faiths. Take your time, there are no
              scores to chase and nothing is shared.
            </p>
          </div>
        </header>

        <div ref={top} tabIndex={-1} className="outline-none" style={{ outline: 'none' }}>
          {widget ? (
            <div data-testid="widget-preview" className="py-2">
              {widget === 'deck' && (
                <FactDeck
                  facts={PREVIEW_FACTS}
                  realm={wr}
                  target="sacred:preview"
                  counts={{ 0: { whoa: 4, knew: 2 } }}
                  kid={sp.get('kid') === '1'}
                />
              )}
              {widget === 'story' && (
                <StoryWalk steps={PREVIEW_STEPS} realm={wr} title="A preview story" />
              )}
              {widget === 'quiz' && (
                <MiniQuiz items={PREVIEW_QUIZ} realm={wr} kid={sp.get('kid') === '1'} />
              )}
              {widget === 'poll' && <PollCard pollId="preview" realm={wr} initial={PREVIEW_POLL} />}
            </div>
          ) : Game && game ? (
            <Suspense
              fallback={
                <p className="lw-muted min-h-[480px]" role="status">
                  Opening the game{'…'}
                </p>
              }
            >
              <Game figures={figures} onExit={exit} realm="sacred" />
            </Suspense>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2" data-testid="game-tiles">
              {(Object.keys(GAMES) as GameId[]).map((id) => {
                const g = GAMES[id];
                const ok = avail[id];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="lw-card flex min-h-28 w-full items-center gap-4 p-4 text-left"
                      disabled={!ok}
                      onClick={() => open(id)}
                      data-testid={`tile-${id}`}
                      style={{ cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.7 }}
                    >
                      <span
                        aria-hidden
                        className="grid h-14 w-14 shrink-0 place-items-center round"
                        style={{ background: 'var(--lw-soft)', color: 'var(--lw-accent)' }}
                      >
                        <Icon name={g.icon} size={30} />
                      </span>
                      <span>
                        <span className="lw-title block text-2xl">{g.title}</span>
                        <span className="lw-muted block">
                          {ok ? g.blurb : 'More figures are arriving soon.'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
