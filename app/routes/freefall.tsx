/**
 * /freefall — the flagship daily game. A hero dives down a collapsing tower; each floor slab has three
 * openings with numbers and you fly through the right answer. One ranked "today's dive" per maths
 * level (same tower for everyone, new at midnight IST), unlimited practice, and boards whose every
 * score was re-played on the server. Guests play first and sign in only to post.
 */
import { m } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { currentUser } from '~/.server/auth';
import { allFighters } from '~/.server/content';
import { getSql } from '~/.server/db';
import type { BoardRow } from '~/.server/freefall';
import {
  allTimeBoard,
  dailyBoard,
  fanKey,
  istDay,
  rankedToday,
  startedToday,
} from '~/.server/freefall';
import { SectionHead } from '~/components/bits';
import { LEVEL_LABEL, LEVELS, type Level } from '~/game/freefall/maths';
import { clearPending, keepPending, type Posted, postRun, readPending } from '~/game/freefall/post';
import { useAnimate } from '~/lib/fx';
import type { Route } from './+types/freefall';

const FreefallGame = lazy(() => import('~/game/freefall/FreefallGame'));

export const meta: Route.MetaFunction = () => [
  { title: 'Freefall: Math Dive — ComicMutant' },
  {
    name: 'description',
    content:
      'A daily superhero maths game: dive down a collapsing tower, fly through the right answer, save the people falling with you. Class 3 to 7+, verified leaderboards.',
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('lvl') ?? '';
  const level: Level = (LEVELS as readonly string[]).includes(raw) ? (raw as Level) : 'normal';
  const day = istDay();
  const yesterday = istDay(Date.now() - 86_400_000);
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const who = user ? [fanKey(user)] : [];
  const [today, prev, ever, ranked, started] = await Promise.all([
    dailyBoard(sql, level, day, 10, user?.name ?? null),
    dailyBoard(sql, level, yesterday, 1),
    allTimeBoard(sql, level, 10, user?.name ?? null),
    user ? rankedToday(sql, user.id, day) : Promise.resolve({}),
    startedToday(sql, who, day),
  ]);
  // Heroes and antiheroes only (originals — never published characters), rotating daily.
  const pool = allFighters().filter((f) => f.kind !== 'villain');
  const n = Math.floor(Date.now() / 86_400_000) % Math.max(1, pool.length);
  const heroes = [...pool.slice(n), ...pool.slice(0, n)].slice(0, 6);
  return {
    level,
    day,
    signedIn: !!user,
    me: user?.name ?? null,
    today,
    // Yesterday's top dive is named only once a mod has checked it.
    champ: prev.rows.find((r) => r.name && !r.pending && r.rank === 1) ?? null,
    ever,
    ranked: ranked as Partial<Record<Level, number>>,
    started,
    heroes,
  };
}

export default function Freefall({ loaderData: d }: Route.ComponentProps) {
  const animate = useAnimate();
  const revalidator = useRevalidator();
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<Posted[]>([]);
  // Back from sign-in, the result of posting the guest run must be on screen (not under the header).
  useEffect(() => {
    if (pending.length)
      document.getElementById('ff-posted')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [pending]);
  useEffect(() => setMounted(true), []);

  // Back from sign-in with a guest run waiting: post it now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per sign-in state.
  useEffect(() => {
    if (!d.signedIn) return;
    // Claim the waiting runs first (an effect that runs twice must not post them twice).
    const runs = readPending();
    clearPending();
    const queue = (['daily', 'practice'] as const).filter((k) => runs[k] !== undefined);
    if (!queue.length) return;
    void (async () => {
      const out: Posted[] = [];
      for (const k of queue) {
        const run = runs[k];
        if (!run) continue;
        const r = await postRun(run.token, run.log);
        // Already posted (by a second copy of this effect) is a success, not an error.
        out.push(
          r.error === 'That run is already posted.'
            ? { ok: true, stored: true, score: run.score }
            : r,
        );
        // A network failure keeps the run for the next visit; anything the server answered is done.
        if (!r.ok && r.error?.startsWith('Network')) keepPending(k, run);
      }
      setPending(out);
      if (out.some((r) => r.ok && r.stored)) void revalidator.revalidate();
    })();
  }, [d.signedIn]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 text-center">
        <m.p
          className="kicker"
          initial={animate ? { y: -10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
        >
          Daily maths dive · a new tower at midnight IST
        </m.p>
        <m.h1
          className="h-display ink-text text-[clamp(3rem,10vw,6.5rem)] text-c3 leading-none"
          initial={animate ? { y: -60, rotate: -4, opacity: 0 } : false}
          animate={{ y: 0, rotate: -2, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        >
          Freefall
        </m.h1>
        <p className="mx-auto max-w-2xl text-lg">
          Fly through the right answer. Dodge the rubble. Catch everyone falling with you.
        </p>
      </header>

      <div id="ff-posted" className="scroll-mt-24">
        {pending.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: at most two fixed-order results.
          <p key={i} role="status" className="bubble mx-auto mb-4 max-w-xl text-center">
            {p.ok && p.stored && p.rank === undefined
              ? `Your guest run (${p.score?.toLocaleString('en-IN')}) is posted.`
              : p.ok && p.stored
                ? p.review || p.pending
                  ? `Your guest run (${p.score?.toLocaleString('en-IN')}) is posted at #${p.rank} — your name shows there after a moderator's quick look.`
                  : `Your guest run (${p.score?.toLocaleString('en-IN')} points) is posted — your best ranks #${p.rank} of ${p.of}.`
                : p.ok
                  ? "That guest run didn't rank (you'd already played or posted today's dive)."
                  : (p.error ?? 'Your guest run could not be posted.')}
          </p>
        ))}
      </div>

      {mounted ? (
        <Suspense fallback={<GameFallback />}>
          <FreefallGame
            heroes={d.heroes}
            signedIn={d.signedIn}
            day={d.day}
            ranked={d.ranked}
            started={d.started}
            initialLevel={d.level}
            onPosted={() => void revalidator.revalidate()}
          />
        </Suspense>
      ) : (
        <GameFallback />
      )}

      <section aria-labelledby="ff-how" className="mt-12 grid gap-4 md:grid-cols-3">
        <h2 id="ff-how" className="sr-only">
          How it works
        </h2>
        {[
          [
            '1 · The slab',
            'Each floor slab has three openings with numbers. The sum is at the top. Fly through the right one — the wrong one costs a heart.',
          ],
          [
            '2 · The fall',
            'You have four hearts. Rubble glowing red is heading for you. Catch the people falling with you: 30 points each, and every third one heals a heart — so does eight right in a row. Dive for speed and bonus points, brake to think.',
          ],
          [
            '3 · The board',
            "Today's dive is the same tower for everyone; your first run counts. Every score is re-played on our server before it goes up.",
          ],
        ].map(([t, b], i) => (
          <m.div
            key={t}
            className="panel p-5"
            initial={animate ? { y: 30, opacity: 0 } : false}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20, delay: i * 0.08 }}
          >
            <h3 className="h-head mb-1 text-xl">{t}</h3>
            <p className="text-sm">{b}</p>
          </m.div>
        ))}
      </section>

      <section aria-labelledby="ff-board" className="mt-12" id="board">
        <SectionHead id="ff-board" kicker="Verified scores only" title="Leaderboard" />
        <nav aria-label="Maths level" className="mb-4 flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <Link
              key={l}
              to={`?lvl=${l}#board`}
              preventScrollReset
              className="chip min-h-11"
              aria-current={l === d.level ? 'page' : undefined}
            >
              {LEVEL_LABEL[l]}
            </Link>
          ))}
        </nav>
        <div className="grid gap-6 md:grid-cols-2">
          <Board
            title={`Today · ${d.day}`}
            sub={`${d.today.total} ${d.today.total === 1 ? 'diver' : 'divers'} so far`}
            rows={d.today.rows}
            empty={
              <>
                Nobody has posted today's {LEVEL_LABEL[d.level]} dive yet. Be the first.
                {d.champ && (
                  <span className="mt-2 block text-muted">
                    Yesterday's top dive: {d.champ.name}, {d.champ.score.toLocaleString('en-IN')}.
                  </span>
                )}
              </>
            }
          />
          <Board
            title="All-time best"
            sub={`${LEVEL_LABEL[d.level]} · best run per player`}
            rows={d.ever}
            empty="No runs posted at this level yet."
          />
        </div>
        {!d.signedIn && (
          <p className="mt-4 text-sm">
            Want your name up there?{' '}
            <Link to="/join?next=/freefall" className="underline">
              Pick a nickname
            </Link>{' '}
            — no email needed. Guests can still play every dive.
          </p>
        )}
      </section>
    </div>
  );
}

function GameFallback() {
  return (
    <div
      className="panel mx-auto grid w-full max-w-5xl place-items-center"
      style={{ aspectRatio: '16 / 9' }}
    >
      <p className="kicker">Loading the tower…</p>
    </div>
  );
}

function Board({
  title,
  sub,
  rows,
  empty,
}: {
  title: string;
  sub: string;
  rows: BoardRow[];
  empty: React.ReactNode;
}) {
  const animate = useAnimate();
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  return (
    <div className="panel p-4">
      <h3 className="h-head text-xl">{title}</h3>
      <p className="mb-3 text-muted text-sm">{sub}</p>
      {rows.length === 0 ? (
        <p className="text-sm">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <m.li
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are ranks; names can be withheld.
              key={i}
              className={`flex items-center gap-3 rounded border-2 border-line px-3 py-1.5 ${r.mine ? 'bg-c3 text-on-c3' : 'bg-bg'} ${i > 0 && r.rank > (rows[i - 1]?.rank ?? 0) + (rows[i - 1]?.more || 1) ? 'mt-4' : ''}`}
              // Rows slide in when the board changes (after a post); never hidden in the server HTML.
              initial={animate && live ? { x: -24, opacity: 0 } : false}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 }}
            >
              {r.more > 0 ? (
                <span className="flex-1 text-sm">
                  <span className="h-display mr-3 inline-block w-8 text-2xl">{r.rank}</span>+
                  {r.more} more {r.more === 1 ? 'run' : 'runs'} awaiting a quick check
                  {r.last && r.last > r.rank ? ` (between ranks ${r.rank} and ${r.last})` : ''}
                </span>
              ) : (
                <>
                  <span className="h-display w-8 text-2xl">{r.rank}</span>
                  <span className="flex-1 truncate font-semibold">
                    {r.mine ? 'You' : (r.name ?? 'Name withheld')}
                    {r.pending && (
                      <span className="ml-2 font-normal text-xs opacity-80">
                        awaiting a quick check
                      </span>
                    )}
                  </span>
                  <span className="text-xs opacity-80">
                    F{r.floors} · {r.correct}/{r.asked}
                  </span>
                  <span className="h-head w-20 text-right">{r.score.toLocaleString('en-IN')}</span>
                </>
              )}
            </m.li>
          ))}
        </ol>
      )}
    </div>
  );
}
