import { Form, Link, useNavigation } from 'react-router';
import { allCharacters, toCard } from '~/.server/content';
import { CharacterCard, SectionHead } from '~/components/bits';
import { IconSearch } from '~/components/icons';
import { useAppendPages } from '~/lib/paging';
import { useFilterSubmit } from '~/lib/search';
import { KINDS, MOTIFS, UNIVERSE_LABEL } from '~/lib/taxonomy';
import type { Route } from './+types/roster';

const PAGE = 30;
const SORTS = { heat: 'Hottest', az: 'A–Z', old: 'Oldest debut', new: 'Newest debut' } as const;
type Sort = keyof typeof SORTS;

export const meta: Route.MetaFunction = () => [
  { title: 'Roster — ComicMutant' },
  {
    name: 'description',
    content: 'Every hero and villain on ComicMutant: Marvel, DC, Desi, anime and indie.',
  },
];

/** Filtering and paging run on the server so the page stays light however big the roster gets. */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 40);
  const u = url.searchParams.get('u') ?? '';
  const k = url.searchParams.get('k') ?? '';
  const mo = url.searchParams.get('m') ?? '';
  const sortRaw = url.searchParams.get('sort') ?? 'heat';
  const sort: Sort = sortRaw in SORTS ? (sortRaw as Sort) : 'heat';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

  let list = allCharacters().filter(
    (c) =>
      (!u || c.universe === u) &&
      (!k || c.kind === k) &&
      (!mo || c.theme.motif === mo) &&
      (!q ||
        c.name.toLowerCase().includes(q) ||
        c.realName?.toLowerCase().includes(q) ||
        c.affiliations.some((a) => a.toLowerCase().includes(q))),
  );
  list = [...list].sort((a, b) =>
    sort === 'az'
      ? a.name.localeCompare(b.name)
      : sort === 'old'
        ? a.firstAppearance.year - b.firstAppearance.year
        : sort === 'new'
          ? b.firstAppearance.year - a.firstAppearance.year
          : b.heat - a.heat,
  );
  return {
    // One page per response; the client appends (lib/paging.ts).
    cards: list.slice((page - 1) * PAGE, page * PAGE).map(toCard),
    total: list.length,
    page,
    pageSize: PAGE,
    filters: { q, u, k, m: mo, sort },
  };
}

type Data = Route.ComponentProps['loaderData'];
const pickCards = (d: Data) => d.cards;
const cardId = (c: Data['cards'][number]) => c.slug;

export default function Roster({ loaderData: d }: Route.ComponentProps) {
  const onFilter = useFilterSubmit();
  const nav = useNavigation();
  const busy = nav.state === 'loading' && nav.location.pathname === '/roster';
  const f = d.filters;
  const key = JSON.stringify(f);
  const pages = useAppendPages(d.cards, key, pickCards, cardId);
  const shown = pages.items;
  const nextPage = Math.max(d.page, pages.page) + 1;
  const more = new URLSearchParams({ ...f, page: String(nextPage) });
  const left = d.total - (nextPage - 1) * d.pageSize;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <SectionHead level={1} kicker={`${d.total} characters`} title="The Roster" />
      <Form
        method="get"
        role="search"
        className="panel mb-8 grid gap-3 p-4 md:grid-cols-[1.5fr_repeat(4,1fr)]"
        onChange={onFilter}
      >
        <label className="block">
          <span className="kicker mb-1 block">Search</span>
          <span className="relative block">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <input
              name="q"
              defaultValue={f.q}
              placeholder="Name, alter ego, team…"
              className="field pl-10"
              type="search"
            />
          </span>
        </label>
        <Select
          name="u"
          label="Universe"
          value={f.u}
          options={Object.entries(UNIVERSE_LABEL).filter(([k]) => k !== 'original')}
        />
        <Select
          name="k"
          label="Side"
          value={f.k}
          options={KINDS.map((k) => [k, k[0]?.toUpperCase() + k.slice(1)])}
        />
        <Select name="m" label="Power motif" value={f.m} options={MOTIFS.map((m) => [m, m])} />
        <Select
          name="sort"
          label="Sort"
          value={f.sort}
          options={Object.entries(SORTS)}
          all={false}
        />
        <noscript>
          <button type="submit" className="btn">
            Filter
          </button>
        </noscript>
      </Form>

      <div aria-live="polite" className="sr-only">
        {busy ? 'Loading' : `${d.total} results`}
      </div>
      {shown.length === 0 ? (
        <div className="bubble mx-auto max-w-md text-center">
          Nobody matches. Even the multiverse is confused —{' '}
          <Link to="/roster" className="underline">
            clear filters
          </Link>
          .
        </div>
      ) : (
        <ul
          className={`grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 lg:grid-cols-5 ${busy ? 'opacity-60' : ''}`}
        >
          {shown.map((c, i) => (
            <CharacterCard key={c.slug} c={c} index={i} />
          ))}
        </ul>
      )}
      {left > 0 && (
        <div className="mt-10 text-center">
          {/* Real link for no-JS (shows that page); with JS the next page is appended in place. */}
          <Link
            to={`?${more}`}
            preventScrollReset
            className="btn btn-c1"
            onClick={(e) => {
              e.preventDefault();
              pages.load(`/roster?${more}`);
            }}
            aria-disabled={pages.loading}
          >
            {pages.loading ? 'Loading…' : `Load more (${left} left)`}
          </Link>
        </div>
      )}
    </div>
  );
}

function Select({
  name,
  label,
  value,
  options,
  all = true,
}: {
  name: string;
  label: string;
  value: string;
  options: [string, string][];
  all?: boolean;
}) {
  return (
    <label className="block">
      <span className="kicker mb-1 block">{label}</span>
      <select name={name} defaultValue={value} className="field capitalize">
        {all && <option value="">All {label.toLowerCase()}s</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
