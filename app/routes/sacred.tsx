/** Sacred India hub: a slow lotus, four doors, the figure of the day, a name search. */
import { Link } from 'react-router';
import { figureOfTheDay, rosterCards, searchFigures } from '~/.server/sacred';
import { CardGrid, FigureCard } from '~/components/sacred/figure-card';
import { SACRED_FONT_LINKS } from '~/components/sacred/fonts';
import {
  LotusBloom,
  Reveal,
  SearchBox,
  SectionTitle,
  TraditionDoors,
} from '~/components/sacred/sections';
import { TRADITION_TABLE } from '~/lib/sacred-taxonomy';
import type { Route } from './+types/sacred';

export function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get('q')?.slice(0, 60) ?? '';
  const cards = rosterCards();
  const doors = TRADITION_TABLE.map((t) => {
    const mine = cards.filter((c) => c.tradition === t.id);
    return {
      id: t.id,
      label: t.label,
      blurb: t.blurb,
      ready: mine.filter((c) => c.ready).length,
      total: mine.length,
    };
  });
  return {
    q,
    results: q ? searchFigures(q) : null,
    doors,
    today: figureOfTheDay(),
    ready: cards.filter((c) => c.ready).length,
    total: cards.length,
  };
}

export const links: Route.LinksFunction = () => SACRED_FONT_LINKS;

export const meta: Route.MetaFunction = () => [
  { title: 'Sacred India: figures of Hindu, Buddhist, Jain and Sikh traditions · ComicMutant' },
  {
    name: 'description',
    content:
      'A calm space to meet the figures of India’s faiths: stories, teachings, places and festivals, with sources, for curious minds of every age.',
  },
];

export default function SacredHub({ loaderData: d }: Route.ComponentProps) {
  return (
    <div className="relative mx-auto max-w-6xl px-4 pb-8">
      <section className="flex flex-col items-center gap-5 pt-10 text-center sm:pt-16">
        <LotusBloom className="size-56 sm:size-72" />
        <p className="kicker sr-rise sr-quick" style={{ '--d': '0s' } as React.CSSProperties}>
          Hindu · Buddhist · Jain · Sikh
        </p>
        <h1
          className="h-display sr-rise sr-quick text-6xl sm:text-8xl"
          style={{ '--d': '0.05s' } as React.CSSProperties}
        >
          Sacred India
        </h1>
        <p
          className="sr-rise sr-quick max-w-xl text-lg text-muted"
          style={{ '--d': '0.1s' } as React.CSSProperties}
        >
          Take a slow breath and meet the figures of India’s faiths: their stories, teachings,
          places and festivals, told in our own words with sources.
        </p>
        <div
          className="sr-rise sr-quick flex w-full flex-col items-center gap-3"
          style={{ '--d': '0.15s' } as React.CSSProperties}
        >
          <SearchBox q={d.q} />
          <Link to="/sacred/learn" className="btn">
            Learn and play, gently
          </Link>
        </div>
      </section>

      {d.results && (
        <section aria-labelledby="results" className="mt-14">
          <SectionTitle id="results" title={`Results for “${d.q}”`} kicker="Search" />
          {d.results.length === 0 ? (
            <p className="panel p-5">
              No figure matches that name yet. Try another spelling, or open a tradition below.
            </p>
          ) : (
            <CardGrid cards={d.results} />
          )}
        </section>
      )}

      <section id="doors" aria-labelledby="doors-h" className="mt-16 sm:mt-24">
        <Reveal>
          <SectionTitle id="doors-h" kicker="Four traditions born in India" title="Choose a door">
            Each tradition is its own world.{' '}
            {d.ready === d.total
              ? `All ${d.total} profiles are written.`
              : `${d.ready} of ${d.total} profiles are written so far; the rest are on their way.`}
          </SectionTitle>
        </Reveal>
        <TraditionDoors doors={d.doors} />
      </section>

      {d.today && (
        <section aria-labelledby="today-h" className="mt-20 sm:mt-28">
          <Reveal>
            <SectionTitle id="today-h" kicker="Figure of the day" title={d.today.name}>
              A new figure each day. Turn the card for three things to know.
            </SectionTitle>
            <div className="max-w-xs">
              <FigureCard card={d.today} />
            </div>
          </Reveal>
        </section>
      )}
    </div>
  );
}
