import { m } from 'motion/react';
import { Link } from 'react-router';
import { listVersus } from '~/.server/community';
import { allCharacters, allFighters, getCharacter, gossipPool, toCard } from '~/.server/content';
import { getSql } from '~/.server/db';
import {
  CharacterCard,
  CountUp,
  MotifClip,
  ScratchCard,
  SectionHead,
  VoteBar,
} from '~/components/bits';
import { IconArrow, IconPad } from '~/components/icons';
import { CLIP_GATE } from '~/lib/clips/gate';
import { SFX } from '~/lib/clips/motifs';
import { VERSUS_PROMPTS } from '~/lib/community';
import { PUBLISHED_UNIVERSES, type PublishedUniverse, UNIVERSE_LABEL } from '~/lib/taxonomy';
import { useTheme } from '~/lib/theme/context';
import type { Route } from './+types/home';

export const meta: Route.MetaFunction = () => [
  { title: 'ComicMutant — every hero, every villain, one loud page' },
  {
    name: 'description',
    content:
      'Marvel, DC, Desi, anime and indie heroes and villains: fun facts, wild gossip, a multiverse timeline, gadget teardowns, 130+ colour themes, mini-games and fan debates.',
  },
];

function dayIndex(n: number) {
  const d = new Date();
  const seed = d.getUTCFullYear() * 400 + d.getUTCMonth() * 31 + d.getUTCDate();
  return n ? (seed * 2654435761) % n : 0;
}

export async function loader() {
  const chars = allCharacters();
  const counts = Object.fromEntries(
    PUBLISHED_UNIVERSES.map((u) => [u, chars.filter((c) => c.universe === u).length]),
  ) as Record<PublishedUniverse, number>;
  // Two rows per universe: heroes, then villains + antiheroes (roster is already sorted by heat).
  const ROW = 10;
  const rows = PUBLISHED_UNIVERSES.map((u) => {
    const mine = chars.filter((c) => c.universe === u);
    return {
      u,
      total: mine.length,
      heroes: mine
        .filter((c) => c.kind === 'hero')
        .slice(0, ROW)
        .map(toCard),
      rogues: mine
        .filter((c) => c.kind !== 'hero')
        .slice(0, ROW)
        .map(toCard),
    };
  });
  const pool = gossipPool().filter((g) => g.spice >= 2);
  const rumour = pool[dayIndex(pool.length)] ?? null;
  const sql = await getSql();
  const top = (await listVersus(sql, 1))[0];
  const versus = top && {
    id: top.id,
    prompt: VERSUS_PROMPTS[top.prompt],
    votes: [top.votes_a, top.votes_b] as const,
    a: getCharacter(top.a),
    b: getCharacter(top.b),
  };
  // One spotlight per universe so the five portals look different.
  const portal = (u: PublishedUniverse) => {
    const c = chars.find((x) => x.universe === u);
    return c && { name: c.name, ...c.theme.palette, motif: c.theme.motif };
  };
  const f = allFighters()[dayIndex(allFighters().length)];
  return {
    trending: chars.slice(0, 10).map(toCard),
    rows,
    counts,
    total: chars.length,
    originals: allFighters().length,
    clips: CLIP_GATE.motif.length,
    portals: {
      ...(Object.fromEntries(PUBLISHED_UNIVERSES.map((u) => [u, portal(u)])) as Record<
        PublishedUniverse,
        ReturnType<typeof portal>
      >),
      original: f && { name: f.alias, ...f.theme.palette, motif: f.theme.motif },
    },
    rumour,
    versus:
      versus?.a && versus.b
        ? {
            id: versus.id,
            prompt: versus.prompt,
            votes: versus.votes,
            a: { name: versus.a.name, c1: versus.a.theme.palette.c1 },
            b: { name: versus.b.name, c1: versus.b.theme.palette.c1 },
          }
        : null,
  };
}

const HEADLINE = [
  { id: 'every-1', w: 'EVERY' },
  { id: 'hero', w: 'HERO.' },
  { id: 'every-2', w: 'EVERY' },
  { id: 'villain', w: 'VILLAIN.' },
];

export default function Home({ loaderData: d }: Route.ComponentProps) {
  const { current } = useTheme();
  const params = {
    c1: current.vars['--c1'] ?? '#ff2e4d',
    c2: current.vars['--c2'] ?? '#1b1464',
    c3: current.vars['--c3'] ?? '#ffd400',
    motif: current.motif,
    name: current.name,
  };
  const words = [...SFX[current.motif], 'KA-POW!', 'BLAM!', 'THOOM!', 'ZING!'];
  return (
    <div className="overflow-x-clip">
      {/* ── splash ── */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-16 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
        <div className="relative z-10 space-y-6">
          <p className="kicker">Marvel · DC · Desi · Anime · Indie · Originals</p>
          <h1 className="h-display text-[clamp(3.4rem,10vw,7.6rem)] leading-[0.86]">
            {HEADLINE.map(({ id, w }, i) => (
              <m.span
                key={id}
                className={`inline-block ink-text ${i % 2 ? 'text-c1-text' : 'text-fg'} mr-[0.18em]`}
                // Position-only entrance: the words are visible in the server HTML (no LCP wait).
                initial={{ y: 40, rotate: i % 2 ? 6 : -6 }}
                animate={{ y: 0, rotate: i % 2 ? 2 : -2 }}
                transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.08 * i }}
              >
                {w}
              </m.span>
            ))}
            <span className="mt-2 block font-head text-[0.32em] text-c3-text tracking-wide">
              one loud page.
            </span>
          </h1>
          <p className="max-w-xl text-lg">
            Wild facts, tabloid-grade gossip, story arcs told like comic strips, a theme for every
            character, and an arena where our original cast fights, smashes shuttles and scores
            goals.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/freefall" className="btn btn-c1 text-lg">
              <IconPad /> Play today's Freefall
            </Link>
            <Link to="/arena" className="btn text-lg">
              Enter the Arena
            </Link>
            <Link to="/roster" className="btn text-lg">
              Meet the roster <IconArrow />
            </Link>
          </div>
          <dl className="flex flex-wrap gap-3 pt-2">
            {[
              [d.total, 'characters'],
              [d.total + d.originals + 1, 'themes'],
              [4, 'games'],
              [d.clips, 'clips each'],
            ].map(([n, label]) => (
              <div key={label} className="panel px-4 py-2 text-center">
                <dt className="sr-only">{label}</dt>
                <dd>
                  <CountUp
                    value={Number(n)}
                    className="h-display block text-4xl text-c1-text-card"
                  />
                  <span className="kicker text-card-fg!">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <m.div
          className="relative"
          initial={{ rotate: 6, scale: 0.92 }}
          animate={{ rotate: 2, scale: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 14 }}
        >
          <div className="panel overflow-hidden p-0 shadow-ink-lg">
            <MotifClip key={current.slug} params={params} kind="splash" aspect={1} save />
          </div>
          <div className="bubble absolute -bottom-8 -left-4 max-w-[16rem] rotate-[-4deg] text-sm sm:-left-10">
            Wearing the <strong>{current.name}</strong> theme. Tap a swatch in the dock to change it
            instantly.
          </div>
        </m.div>
      </section>

      {/* ── SFX marquee ── */}
      <div
        aria-hidden
        className="relative -rotate-1 overflow-hidden border-line border-y-[3px] bg-c3 py-2 text-on-c3"
      >
        <div className="marquee flex w-max gap-10 whitespace-nowrap">
          {[...words, ...words, ...words, ...words].map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative list.
            <span key={i} className="h-display text-3xl">
              {w}
            </span>
          ))}
        </div>
      </div>

      {/* ── universes ── */}
      <section className="mx-auto max-w-7xl px-4 pt-20">
        <SectionHead kicker="Pick a door" title="Six universes" />
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {([...PUBLISHED_UNIVERSES, 'original'] as const).map((u, i) => {
            const p = d.portals[u] ?? {
              name: UNIVERSE_LABEL[u],
              c1: '#ff2e4d',
              c2: '#1b1464',
              c3: '#ffd400',
              motif: 'cosmic' as const,
            };
            const count = u === 'original' ? d.originals : d.counts[u];
            const href = u === 'original' ? '/originals' : `/roster?u=${u}`;
            return (
              <m.li
                key={u}
                initial={{ y: 30, rotate: 0 }}
                whileInView={{ y: 0, rotate: i % 2 ? 1.5 : -1.5 }}
                whileHover={{ rotate: 0, y: -6 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 300, damping: 18, delay: i * 0.05 }}
              >
                <Link to={href} className="panel group block overflow-hidden">
                  <MotifClip
                    params={p}
                    kind={
                      ['orbit', 'storm', 'kaleido', 'splash', 'portal', 'spotlight'][i] ?? 'orbit'
                    }
                    aspect={1}
                    decorative
                  />
                  <div className="border-line border-t-[3px] p-3">
                    <p className="h-display text-3xl">{UNIVERSE_LABEL[u]}</p>
                    <p className="text-muted text-sm">{count} characters</p>
                  </div>
                </Link>
              </m.li>
            );
          })}
        </ul>
      </section>

      {/* ── two rows per universe ── */}
      {d.rows.map((r, ri) => (
        <section key={r.u} aria-labelledby={`row-${r.u}`} className="mx-auto max-w-7xl px-4 pt-20">
          <SectionHead
            id={`row-${r.u}`}
            kicker={`${r.total} characters`}
            title={UNIVERSE_LABEL[r.u]}
            action={
              <Link to={`/roster?u=${r.u}`} className="btn">
                All {UNIVERSE_LABEL[r.u]} <IconArrow />
              </Link>
            }
          />
          {(
            [
              ['Heroes', r.heroes, 'hero'],
              ['Villains & antiheroes', r.rogues, ''],
            ] as const
          ).map(([label, cards, k], row) =>
            cards.length ? (
              <div key={label} className="mb-6">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="kicker">{label}</h3>
                  <Link
                    to={`/roster?u=${r.u}${k ? `&k=${k}` : ''}`}
                    className="inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
                  >
                    See all
                  </Link>
                </div>
                {/* Rows enter from opposite sides; native scroll + snap, so touch, wheel and keys all work. */}
                <m.ul
                  className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pt-1 pb-4"
                  initial={{ x: row ? 60 : -60, opacity: 0.4 }}
                  whileInView={{ x: 0, opacity: 1 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22, delay: ri ? 0 : 0.1 }}
                >
                  {cards.map((c, i) => (
                    <CharacterCard
                      key={c.slug}
                      c={c}
                      index={i}
                      className="w-40 shrink-0 snap-start sm:w-44 lg:w-48"
                    />
                  ))}
                </m.ul>
              </div>
            ) : null,
          )}
        </section>
      ))}

      {/* ── trending ── */}
      <section className="mx-auto max-w-7xl px-4 pt-20">
        <SectionHead
          kicker="Hot right now"
          title="Trending"
          action={
            <Link to="/roster" className="btn">
              All {d.total} <IconArrow />
            </Link>
          }
        />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {d.trending.map((c, i) => (
            <CharacterCard key={c.slug} c={c} index={i} />
          ))}
        </ul>
      </section>

      {/* ── rumour + versus ── */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 pt-20 lg:grid-cols-2">
        {d.rumour && (
          <div className="panel halftone tilt-l space-y-4 p-6">
            <p className="kicker">Rumour of the day</p>
            <h2 className="h-display text-4xl">Psst… about {d.rumour.name}</h2>
            <ScratchCard label="the rumour" className="rounded-md" foil={d.rumour.palette.c3}>
              <div className="bubble min-h-32 text-base">
                <p>{d.rumour.text}</p>
                {d.rumour.truth && (
                  <p className="mt-2 font-semibold">
                    Truth: <span className="font-normal">{d.rumour.truth}</span>
                  </p>
                )}
              </div>
            </ScratchCard>
            <Link to="/rumours" className="btn btn-c3">
              More rumours <IconArrow />
            </Link>
          </div>
        )}
        {d.versus && (
          <div className="panel tilt-r space-y-4 p-6">
            <p className="kicker">Versus of the day</p>
            <h2 className="h-display text-4xl">
              {d.versus.a.name} <span className="text-c1-text-card">vs</span> {d.versus.b.name}
            </h2>
            <p className="h-head text-xl">{d.versus.prompt}</p>
            <VoteBar
              a={d.versus.votes[0]}
              b={d.versus.votes[1]}
              ca={d.versus.a.c1}
              cb={d.versus.b.c1}
            />
            <Link to={`/versus/${d.versus.id}`} className="btn btn-c1">
              Pick a side <IconArrow />
            </Link>
          </div>
        )}
      </section>

      {/* ── arena teaser ── */}
      <section className="mx-auto max-w-7xl px-4 pt-20">
        <div className="panel-c1 halftone speed-bg relative overflow-hidden p-8 sm:p-12">
          <div className="panel relative max-w-xl space-y-4 p-6">
            <p className="kicker">The Arena</p>
            <h2 className="h-display text-5xl">Fight. Smash. Score. Quiz.</h2>
            <p>
              Hero vs villain, hero vs hero, villain vs villain — {d.originals} original fighters,
              four games, CPU or a friend on the same keyboard.
            </p>
            <Link to="/arena" className="btn btn-c1">
              <IconPad /> Play now
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
