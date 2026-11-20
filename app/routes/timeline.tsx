/**
 * /timeline — the multiverse timeline: every hero's and villain's real-world milestones (debuts,
 * landmark stories, screen firsts, deaths, comebacks), one decade at a time so the page stays light.
 * A Motion bar chart of the decades (heroes up, villains down) is the navigation; the spine below
 * fills as you scroll. Filters (universe, side) are URL params handled in the loader.
 */
import { m } from 'motion/react';
import { Form, Link } from 'react-router';
import { timelinePool } from '~/.server/content';
import { SectionHead } from '~/components/bits';
import { IconArrow } from '~/components/icons';
import { Spine } from '~/components/timeline';
import { useAnimate } from '~/lib/fx';
import { useFilterSubmit } from '~/lib/search';
import { PUBLISHED_UNIVERSES, UNIVERSE_LABEL } from '~/lib/taxonomy';
import type { Route } from './+types/timeline';

export const meta: Route.MetaFunction = () => [
  { title: 'Multiverse Timeline — ComicMutant' },
  {
    name: 'description',
    content:
      'Every debut, death, comeback and screen first of Marvel, DC, Desi, anime and indie heroes and villains, decade by decade.',
  },
];

const SIDES = { '': 'Everyone', hero: 'Heroes', rogue: 'Villains & antiheroes' } as const;
type Side = keyof typeof SIDES;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const uRaw = url.searchParams.get('u') ?? '';
  const u = (PUBLISHED_UNIVERSES as readonly string[]).includes(uRaw) ? uRaw : '';
  const sRaw = url.searchParams.get('s') ?? '';
  const s: Side = sRaw in SIDES ? (sRaw as Side) : '';
  const rows = timelinePool().filter((r) => (!u || r.universe === u) && (!s || r.side === s));

  const decadeOf = (y: number) => Math.floor(y / 10) * 10;
  const decades = [...new Set(rows.map((r) => decadeOf(r.year)))].sort((a, b) => a - b);
  const counts = decades.map((d) => ({
    d,
    hero: rows.filter((r) => decadeOf(r.year) === d && r.side === 'hero').length,
    rogue: rows.filter((r) => decadeOf(r.year) === d && r.side === 'rogue').length,
  }));
  const asked = Number(url.searchParams.get('d'));
  const decade = decades.includes(asked) ? asked : (decades[0] ?? 1930);
  const i = decades.indexOf(decade);
  return {
    filters: { u, s },
    counts,
    decade,
    prev: decades[i - 1] ?? null,
    next: decades[i + 1] ?? null,
    items: rows.filter((r) => decadeOf(r.year) === decade),
    total: rows.length,
  };
}

export default function Timeline({ loaderData: d }: Route.ComponentProps) {
  const onFilter = useFilterSubmit();
  const animate = useAnimate();
  const max = Math.max(1, ...d.counts.map((c) => Math.max(c.hero, c.rogue)));
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (d.filters.u) p.set('u', d.filters.u);
    if (d.filters.s) p.set('s', d.filters.s);
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `?${p}`;
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <SectionHead
        level={1}
        kicker={`${d.total} milestones · heroes left, villains right`}
        title="Multiverse Timeline"
      />

      <Form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3"
        onChange={onFilter}
        aria-label="Filter the timeline"
      >
        <input type="hidden" name="d" value={d.decade} />
        <label className="block">
          <span className="kicker mb-1 block">Universe</span>
          <select name="u" defaultValue={d.filters.u} className="field">
            <option value="">Every universe</option>
            {PUBLISHED_UNIVERSES.map((u) => (
              <option key={u} value={u}>
                {UNIVERSE_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="kicker mb-1 block">Side</span>
          <select name="s" defaultValue={d.filters.s} className="field">
            {Object.entries(SIDES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <noscript>
          <button type="submit" className="btn">
            Go
          </button>
        </noscript>
      </Form>

      {/* Decade chart: each column is a link. Hero bars rise, villain bars hang below the line. */}
      <nav aria-label="Decades" className="panel mb-10 overflow-x-auto p-4">
        <ul className="flex min-w-max items-stretch gap-2">
          {d.counts.map((c, i) => {
            const on = c.d === d.decade;
            return (
              <li key={c.d}>
                <Link
                  to={qs({ d: c.d })}
                  preventScrollReset
                  aria-current={on ? 'page' : undefined}
                  aria-label={`${c.d}s: ${c.hero} hero milestones, ${c.rogue} villain milestones`}
                  className={`flex w-16 flex-col items-center rounded-skin-s px-1 py-2 transition-colors hover:bg-bg ${on ? 'bg-bg outline-3 outline-c3-text' : ''}`}
                >
                  <span className="flex h-20 w-full items-end justify-center">
                    {c.hero > 0 && (
                      <m.span
                        className="block w-6 origin-bottom border-2 border-line bg-c1"
                        style={{ height: `${(c.hero / max) * 100}%` }}
                        initial={animate ? { scaleY: 0 } : false}
                        animate={{ scaleY: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 220,
                          damping: 18,
                          delay: i * 0.04,
                        }}
                      />
                    )}
                  </span>
                  <span className="h-display my-1 text-lg leading-none">{`${c.d}s`}</span>
                  <span className="flex h-20 w-full items-start justify-center">
                    {c.rogue > 0 && (
                      <m.span
                        className="block w-6 origin-top border-2 border-line bg-c3"
                        style={{ height: `${(c.rogue / max) * 100}%` }}
                        initial={animate ? { scaleY: 0 } : false}
                        animate={{ scaleY: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 220,
                          damping: 18,
                          delay: i * 0.04 + 0.1,
                        }}
                      />
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex gap-4 text-muted text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="size-3 border-2 border-line bg-c1" /> Heroes
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 border-2 border-line bg-c3" /> Villains &amp; antiheroes
          </span>
        </p>
      </nav>

      <div className="mb-2 hidden grid-cols-2 gap-16 md:grid">
        <p className="h-display text-right text-3xl text-c1-text">Heroes</p>
        <p className="h-display text-3xl text-c3-text">Villains</p>
      </div>
      <h2 className="sr-only">{d.decade}s</h2>
      {d.items.length ? (
        <Spine key={`${d.decade}${d.filters.u}${d.filters.s}`} items={d.items} />
      ) : (
        <p className="panel p-6">Nothing on record for this decade with these filters.</p>
      )}

      <div className="mt-10 flex flex-wrap justify-between gap-3">
        {d.prev !== null ? (
          <Link to={qs({ d: d.prev })} className="btn">
            ← The {d.prev}s
          </Link>
        ) : (
          <span />
        )}
        {d.next !== null && (
          <Link to={qs({ d: d.next })} className="btn btn-c1">
            On to the {d.next}s <IconArrow />
          </Link>
        )}
      </div>
    </div>
  );
}
