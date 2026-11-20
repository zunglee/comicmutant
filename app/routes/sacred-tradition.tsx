/** One tradition: its groups as sections of cards, in canonical order. */
import { data, Link } from 'react-router';
import { cardsBy, groupsOf } from '~/.server/sacred';
import { SACRED_FONT_LINKS } from '~/components/sacred/fonts';
import {
  FIRST_ROW,
  GroupCards,
  ORDERED_GROUPS,
  Reveal,
  SectionTitle,
} from '~/components/sacred/sections';
import { SymbolArt } from '~/components/sacred/symbol-art';
import { TRADITION_LOOK, toRow } from '~/components/sacred/types';
import { UNNUMBERED } from '~/components/sacred/unnumbered';
import { TRADITION_TABLE } from '~/lib/sacred-taxonomy';
import type { Route } from './+types/sacred-tradition';

export function loader({ params }: Route.LoaderArgs) {
  const t = TRADITION_TABLE.find((x) => x.id === params.tradition);
  if (!t) throw data('That path is not part of Sacred India.', { status: 404 });
  const groups = groupsOf(t.id)
    .map((g) => ({ id: g.id, label: g.label, cards: cardsBy({ tradition: t.id, group: g.id }) }))
    .filter((g) => g.cards.length > 0)
    // Closing cards (Guru Granth Sahib) always come last in their lineage.
    .map((g) => ({
      ...g,
      cards: [
        ...g.cards.filter((c) => !UNNUMBERED[c.slug]),
        ...g.cards.filter((c) => UNNUMBERED[c.slug]),
      ],
    }));
  const all = groups.flatMap((g) => g.cards);
  // Card rows only: the first row as full cards, the rest as light link rows (no facts, no art data).
  const slim = groups.map((g) => ({
    id: g.id,
    label: g.label,
    // Heading counts exclude closing cards: ten Gurus, then the eternal Guru.
    total: g.cards.filter((c) => !UNNUMBERED[c.slug]).length,
    // Ordered lineages show every card, in order; other groups collapse to a first row.
    cards: ORDERED_GROUPS.includes(g.id) ? g.cards : g.cards.slice(0, FIRST_ROW),
    more: ORDERED_GROUPS.includes(g.id) ? [] : g.cards.slice(FIRST_ROW).map(toRow),
  }));
  return {
    tradition: t,
    groups: slim,
    ready: all.filter((c) => c.ready).length,
    total: all.length,
  };
}

export const links: Route.LinksFunction = () => SACRED_FONT_LINKS;

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${loaderData.tradition.label} figures · Sacred India · ComicMutant` },
        { name: 'description', content: loaderData.tradition.blurb },
      ]
    : [{ title: 'Not found · Sacred India' }];

export default function SacredTradition({ loaderData: d }: Route.ComponentProps) {
  const look = TRADITION_LOOK[d.tradition.id];
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8">
      <header className="pt-10 text-center sm:pt-14">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm">
          <Link to="/sacred" className="sacred-crumb">
            Sacred India
          </Link>
        </nav>
        <div className="tradition-mark" aria-hidden>
          <SymbolArt symbol={look.symbol} c1={look.c1} c2={look.c2} live={false} />
        </div>
        <h1 className="h-display sr-rise text-6xl sm:text-7xl">{d.tradition.label}</h1>
        <p
          className="sr-rise mx-auto mt-3 max-w-xl text-lg text-muted"
          style={{ '--d': '0.3s' } as React.CSSProperties}
        >
          {d.tradition.blurb}. {look.line}.
        </p>
        <p
          className="sr-rise mt-2 text-sm text-muted"
          style={{ '--d': '0.5s' } as React.CSSProperties}
        >
          {d.ready} of {d.total} profiles ready
        </p>
        {d.groups.length > 1 && (
          <nav aria-label="Groups" className="mt-6 flex flex-wrap justify-center gap-2">
            {d.groups.map((g) => (
              <a key={g.id} href={`#g-${g.id}`} className="sacred-chip hover:bg-card">
                {g.label}
              </a>
            ))}
          </nav>
        )}
      </header>
      {d.groups.map((g) => (
        <section key={g.id} id={`g-${g.id}`} aria-labelledby={`h-${g.id}`} className="mt-14">
          <Reveal>
            <SectionTitle id={`h-${g.id}`} title={g.label} kicker={`${g.total} figures`} />
          </Reveal>
          <GroupCards id={g.id} cards={g.cards} more={g.more} />
        </section>
      ))}
    </div>
  );
}
