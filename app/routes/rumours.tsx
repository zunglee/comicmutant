import { AnimatePresence, m, useMotionValue, useTransform } from 'motion/react';
import { useState } from 'react';
import { Form, Link, useSubmit } from 'react-router';
import { gossipPool } from '~/.server/content';
import { ScratchCard } from '~/components/bits';
import { useAppendPages } from '~/lib/paging';
import { PUBLISHED_UNIVERSES, UNIVERSE_LABEL } from '~/lib/taxonomy';
import { scopeVars } from '~/lib/theme/compute';
import type { Route } from './+types/rumours';

export const meta: Route.MetaFunction = () => [
  { title: 'The Rumour Mill — ComicMutant' },
  {
    name: 'description',
    content:
      'Hidden facts, behind-the-scenes gossip and busted myths about your favourite heroes and villains.',
  },
];

const PAGE = 24;

function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const u = url.searchParams.get('u') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const pool = gossipPool();
  // The wall reshuffles hourly; the seed rides in the URL so later pages match the first.
  const seedRaw = Number(url.searchParams.get('s'));
  const seed =
    Number.isInteger(seedRaw) && seedRaw > 0 ? seedRaw : Math.floor(Date.now() / 3_600_000);
  const wall = shuffle(
    pool.filter((g) => !u || g.universe === u),
    seed,
  );
  // True-or-cap deck: myths are "cap", facts and gossip are "true". Myth-heavy so it's a real game.
  const myths = pool.filter((g) => g.type === 'myth');
  const truths = pool.filter((g) => g.type !== 'myth');
  const deck = shuffle(
    [...shuffle(myths, seed + 1).slice(0, 6), ...shuffle(truths, seed + 2).slice(0, 6)],
    seed + 3,
  ).map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    text: g.text,
    truth: g.truth ?? null,
    cap: g.type === 'myth',
    palette: g.palette,
  }));
  return {
    wall: wall.slice((page - 1) * PAGE, page * PAGE),
    total: wall.length,
    page,
    pageSize: PAGE,
    seed,
    u,
    deck,
  };
}

type Data = Route.ComponentProps['loaderData'];
const pickWall = (d: Data) => d.wall;
const wallId = (g: Data['wall'][number]) => g.id;

export default function Rumours({ loaderData: d }: Route.ComponentProps) {
  const submit = useSubmit();
  const pages = useAppendPages(d.wall, `${d.u}|${d.seed}`, pickWall, wallId);
  const nextPage = Math.max(d.page, pages.page) + 1;
  const more = new URLSearchParams({ u: d.u, s: String(d.seed), page: String(nextPage) });
  const left = d.total - (nextPage - 1) * d.pageSize;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="panel halftone mb-12 border-[4px] p-6 text-center sm:p-10">
        <p className="font-head text-xs tracking-[0.3em] uppercase">
          Late edition · unverified by nobody
        </p>
        <h1 className="h-display text-[clamp(3rem,9vw,7rem)] leading-none">The Rumour Mill</h1>
        <p className="mx-auto mt-2 max-w-xl">
          Every item here is true — except the ones stamped MYTH, which the internet keeps repeating
          anyway.
        </p>
      </header>

      <TrueOrCap deck={d.deck} />

      <section aria-labelledby="wall-h" className="mt-20">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 id="wall-h" className="h-display ink-text text-5xl text-c1-text">
            The wall
          </h2>
          <Form
            method="get"
            onChange={(e) => submit(e.currentTarget, { replace: true, preventScrollReset: true })}
          >
            <label>
              <span className="sr-only">Universe</span>
              <select name="u" defaultValue={d.u} className="field">
                <option value="">All universes</option>
                {PUBLISHED_UNIVERSES.map((u) => (
                  <option key={u} value={u}>
                    {UNIVERSE_LABEL[u]}
                  </option>
                ))}
              </select>
            </label>
          </Form>
        </div>
        <ul className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>li]:mb-5">
          {pages.items.map((g, i) => (
            <m.li
              key={g.id}
              initial={{ y: 20 }}
              whileInView={{ y: 0 }}
              viewport={{ once: true }}
              className="panel break-inside-avoid space-y-3 p-5"
              style={scopeVars(g.palette) as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  to={`/c/${g.slug}`}
                  className="h-display inline-flex min-h-11 items-center text-2xl hover:underline"
                >
                  {g.name}
                </Link>
                <span className="border-2 border-line bg-c3 px-2 font-display text-on-c3">
                  {g.type === 'myth' ? 'MYTH' : g.type === 'gossip' ? 'PSST' : 'FACT'}
                </span>
              </div>
              {g.spice === 3 && i % 3 === 0 ? (
                <ScratchCard label={`${g.name} rumour`} foil={g.palette.c3} className="rounded-md">
                  <p className="min-h-20 leading-snug">{g.text}</p>
                </ScratchCard>
              ) : (
                <p className="leading-snug">{g.text}</p>
              )}
              {g.truth && (
                <p className="bubble text-sm">
                  <strong className="font-display text-[#b00020]">BUSTED: </strong>
                  {g.truth}
                </p>
              )}
            </m.li>
          ))}
        </ul>
        {left > 0 && (
          <div className="mt-8 text-center">
            <Link
              to={`?${more}`}
              preventScrollReset
              className="btn btn-c1"
              onClick={(e) => {
                e.preventDefault();
                pages.load(`/rumours?${more}`);
              }}
            >
              {pages.loading ? 'Loading…' : `More rumours (${left})`}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

type Card = Route.ComponentProps['loaderData']['deck'][number];

/** Swipe right = TRUE, left = CAP. Buttons and arrow keys do the same. */
function TrueOrCap({ deck }: { deck: Card[] }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [last, setLast] = useState<{ ok: boolean; card: Card } | null>(null);
  const card = deck[i];
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const trueOp = useTransform(x, [20, 120], [0, 1]);
  const capOp = useTransform(x, [-120, -20], [1, 0]);

  function answer(sayCap: boolean) {
    if (!card) return;
    const ok = sayCap === card.cap;
    setScore((s) => s + (ok ? 1 : 0));
    setStreak((s) => (ok ? s + 1 : 0));
    setLast({ ok, card });
    setI((n) => n + 1);
    x.set(0);
  }

  return (
    <section aria-labelledby="toc-h" className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <p className="kicker">Mini-game</p>
        <h2 id="toc-h" className="h-display ink-text text-6xl text-c1-text">
          True or Cap?
        </h2>
        <p>
          Swipe right if it's true, left if it's cap. Or use the buttons (← → work once a button has
          focus).
        </p>
        <p className="h-head text-2xl" aria-live="polite">
          Score {score}/{Math.min(i, deck.length)} · Streak {streak}
        </p>
        <AnimatePresence mode="wait">
          {last && (
            <m.div
              key={last.card.id}
              initial={{ scale: 0.8, rotate: -3 }}
              animate={{ scale: 1, rotate: -1 }}
              exit={{ opacity: 0 }}
              className="bubble"
              role="status"
            >
              <strong className="font-display text-2xl">
                {last.ok ? 'NAILED IT!' : 'GOTCHA!'}
              </strong>{' '}
              {last.card.cap
                ? `That one's a myth. ${last.card.truth ?? ''}`
                : `That's 100% real — ${last.card.name} trivia.`}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <section
        className="relative mx-auto h-[22rem] w-full max-w-sm"
        aria-label="True or cap card deck"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') answer(false);
          if (e.key === 'ArrowLeft') answer(true);
        }}
      >
        {card ? (
          <>
            {deck[i + 1] && (
              <div
                className="panel absolute inset-0 translate-x-2 translate-y-2 rotate-3"
                aria-hidden
              />
            )}
            <m.article
              key={card.id}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.9}
              style={{ x, rotate, ...(scopeVars(card.palette) as object) }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 110) answer(false);
                else if (info.offset.x < -110) answer(true);
              }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="panel absolute inset-0 flex cursor-grab touch-pan-y flex-col justify-between p-6 active:cursor-grabbing"
            >
              <m.span
                style={{ opacity: trueOp }}
                className="absolute top-5 left-5 -rotate-12 border-4 border-[#1f9d55] px-2 font-display text-3xl text-[#1f9d55]"
              >
                TRUE
              </m.span>
              <m.span
                style={{ opacity: capOp }}
                className="absolute top-5 right-5 rotate-12 border-4 border-[#b00020] px-2 font-display text-3xl text-[#b00020]"
              >
                CAP
              </m.span>
              <p className="kicker mt-10">About {card.name}</p>
              <p className="text-xl leading-snug">{card.text}</p>
              <div className="flex gap-3">
                <button type="button" className="btn flex-1" onClick={() => answer(true)}>
                  ← Cap
                </button>
                <button type="button" className="btn btn-c1 flex-1" onClick={() => answer(false)}>
                  True →
                </button>
              </div>
            </m.article>
          </>
        ) : (
          <div className="panel-c1 halftone absolute inset-0 grid place-items-center p-6 text-center">
            <div className="space-y-3">
              <p className="h-display text-6xl">
                {score}/{deck.length}
              </p>
              <p>
                {score >= deck.length - 1
                  ? 'Rumour royalty.'
                  : score > deck.length / 2
                    ? 'Solid instincts.'
                    : 'The internet got you.'}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setI(0);
                  setScore(0);
                  setStreak(0);
                  setLast(null);
                }}
              >
                Play again
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
