import { useEffect, useMemo, useRef, useState } from 'react';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { data, useSearchParams } from 'react-router';
import { allCharacters } from '~/.server/content';
import { ensureGuest, pollsFor, pollView } from '~/.server/polls';
import { DesiCard } from '~/components/desi/desi-card';
import { EraTimeline } from '~/components/desi/era-timeline';
import { type DayFact, FactOfDay } from '~/components/desi/fact-of-day';
import { DesiFilters } from '~/components/desi/filters';
import { DesiHeader } from '~/components/desi/hero-header';
import { HeroTable } from '~/components/desi/hero-table';
import {
  type DesiCardData,
  type DesiFilter,
  type DesiView,
  dayNumber,
  decadeBuckets,
  decadeOf,
  filterHeroes,
  filterToParams,
  groupFacets,
  lettersPresent,
  MEDIUMS,
  NO_FILTER,
  parseCount,
  parseFilter,
  publisherGroup,
  seededShuffle,
} from '~/components/desi/logic';
import { PollSlots } from '~/components/desi/polls';
import { Shelves } from '~/components/desi/shelves';
import { DesiTrivia, type TriviaItem } from '~/components/desi/trivia';
import type { PollView } from '~/components/learn/contract';
import type { Route } from './+types/desi';

const PAGE = 24;

export const meta: Route.MetaFunction = () => [
  { title: 'Desi — Indian superheroes, facts & trivia · ComicMutant' },
  {
    name: 'description',
    content:
      'The wiki of Indian superheroes: Raj Comics, Diamond, Indrajal, film and TV heroes with sourced facts, debut timeline and trivia.',
  },
];

/** Filters live in the URL and are applied in the browser, so the loader must not re-run for them. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;
}

export async function loader({ request }: Route.LoaderArgs) {
  const chars = allCharacters().filter((c) => c.universe === 'indian');
  const heroes: DesiCardData[] = chars.map((c) => ({
    slug: c.slug,
    name: c.name,
    kind: c.kind,
    summary: c.summary,
    palette: c.theme.palette,
    motif: c.theme.motif,
    heat: c.heat,
    year: c.firstAppearance.year,
    publisher: c.publisher,
    group: publisherGroup(c.publisher, c.medium),
    medium: c.medium,
    factCount: c.facts?.length ?? 0,
    creators: c.creators,
    hay: [c.name, c.realName ?? '', ...c.affiliations].join(' ').toLowerCase(),
  }));
  const day = dayNumber(Date.now());

  const allFacts = chars.flatMap((c) =>
    (c.facts ?? [])
      .filter((f) => f.interest >= 7)
      .map((f) => ({ text: f.text, kind: f.kind, source: f.source, slug: c.slug, name: c.name })),
  );
  const dayFacts: DayFact[] = seededShuffle(allFacts, day).slice(0, 6);

  const pool: TriviaItem[] = chars.flatMap((c) =>
    c.quiz.map((q, i) => ({ ...q, id: `${c.slug}#${i}`, slug: c.slug, name: c.name })),
  );
  const trivia = seededShuffle(pool, day + 1).slice(0, 15);

  const headers = new Headers();
  await ensureGuest(request, headers);
  const polls = (await Promise.all(pollsFor('desi').map((p) => pollView(p.id, request)))).filter(
    (p): p is PollView => p !== null,
  );

  return data(
    {
      heroes,
      totalFacts: heroes.reduce((n, h) => n + h.factCount, 0),
      dayFacts,
      trivia,
      polls,
    },
    { headers },
  );
}

export default function Desi({ loaderData: d }: Route.ComponentProps) {
  const [sp, setSp] = useSearchParams();
  const parsed = useMemo(() => parseFilter(sp), [sp]);
  const view: DesiView = parsed.view;
  const [qText, setQText] = useState(parsed.f.q);
  // Back/Forward changes the URL; keep the search box in step with it.
  useEffect(() => setQText(parsed.f.q), [parsed.f.q]);
  const f: DesiFilter = { ...parsed.f, q: qText };
  const gridRef = useRef<HTMLElement>(null);
  const set = (patch: Partial<DesiFilter>) => {
    const typing = Object.keys(patch).length === 1 && 'q' in patch;
    const next = { ...parsed.f, ...patch };
    if ('q' in patch) setQText(next.q);
    setSp(filterToParams(next, view), { replace: typing, preventScrollReset: true });
  };
  const setView = (v: DesiView) =>
    setSp(filterToParams(parsed.f, v), { replace: true, preventScrollReset: true });
  const groups = useMemo(() => groupFacets(d.heroes), [d.heroes]);
  const buckets = useMemo(() => decadeBuckets(d.heroes), [d.heroes]);
  const eras = useMemo(
    () => [...new Set(d.heroes.map((h) => decadeOf(h.year)))].sort((a, b) => a - b),
    [d.heroes],
  );
  const mediums = useMemo(
    () => MEDIUMS.filter((m) => d.heroes.some((h) => h.medium === m)),
    [d.heroes],
  );
  // A–Z only offers letters that still have a name under the other active filters.
  const letters = useMemo(
    () => lettersPresent(filterHeroes(d.heroes, { ...parsed.f, letter: '' })),
    [d.heroes, parsed.f],
  );
  const list = useMemo(() => filterHeroes(d.heroes, parsed.f), [d.heroes, parsed.f]);
  const limit = parseCount(sp, PAGE, list.length);
  const shown = list.slice(0, limit);
  const jump = (patch: Partial<DesiFilter>) => {
    set(patch);
    requestAnimationFrame(() =>
      gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  return (
    <div>
      <DesiHeader
        heroes={d.heroes.length}
        facts={d.totalFacts}
        publishers={groups.length}
        palettes={d.heroes.map((h) => h.palette.c1)}
      />
      <div className="mx-auto max-w-7xl space-y-16 px-4 pt-10 pb-32">
        <section ref={gridRef} aria-labelledby="grid-h" className="scroll-mt-4 space-y-5">
          <p className="kicker">The hub</p>
          <h2 id="grid-h" className="h-display ink-text text-5xl text-c1-text sm:text-6xl">
            Every hero
          </h2>
          <DesiFilters
            f={f}
            set={set}
            groups={groups}
            mediums={mediums}
            eras={eras}
            total={d.heroes.length}
            shown={list.length}
            letters={letters}
            view={view}
            setView={setView}
          />
          {shown.length === 0 ? (
            <div className="bubble mx-auto max-w-md text-center">
              Nobody matches those filters.{' '}
              <button type="button" className="underline" onClick={() => set(NO_FILTER)}>
                Clear filters
              </button>
              .
            </div>
          ) : view === 'table' ? (
            <HeroTable rows={shown} />
          ) : (
            <ul
              data-testid="desi-grid"
              className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4"
            >
              {shown.map((c, i) => (
                <DesiCard key={c.slug} c={c} index={i} />
              ))}
            </ul>
          )}
          {list.length > shown.length && (
            <div className="text-center">
              <button
                type="button"
                className="btn btn-c1"
                onClick={() => {
                  const next = filterToParams(parsed.f, view);
                  next.set('n', String(limit + PAGE));
                  setSp(next, { replace: true, preventScrollReset: true });
                }}
              >
                Show more ({list.length - shown.length} left)
              </button>
            </div>
          )}
        </section>

        <EraTimeline buckets={buckets} active={f.era} onPick={(era) => jump({ era })} />

        <div className="grid gap-8 lg:grid-cols-2">
          {d.dayFacts.length > 0 && <FactOfDay facts={d.dayFacts} />}
          <DesiTrivia items={d.trivia} />
        </div>

        <Shelves heroes={d.heroes} groups={groups} onOpen={(group) => jump({ group })} />

        <PollSlots polls={d.polls} />
      </div>
    </div>
  );
}
