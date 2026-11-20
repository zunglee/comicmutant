import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';
import { Form, Link } from 'react-router';
import { themeIndex } from '~/.server/content';
import { HOUSE } from '~/.server/themes';
import { SectionHead } from '~/components/bits';
import { IconCheck, IconDownload, IconPin, IconSearch, IconX } from '~/components/icons';
import { useFilterSubmit } from '~/lib/search';
import { MOTIFS, UNIVERSE_TABLE } from '~/lib/taxonomy';
import { downloadPack, lockerPacks, removeFromLocker } from '~/lib/theme/client';
import { packVersion, type ThemeIndexRow, type ThemePack } from '~/lib/theme/compute';
import { useTheme } from '~/lib/theme/context';
import type { Route } from './+types/themes';

export const meta: Route.MetaFunction = () => [
  { title: 'Theme shop — ComicMutant' },
  {
    name: 'description',
    content: 'Re-skin the whole site as your favourite hero or villain. 130 themes, top-5 dock.',
  },
];

/**
 * Group axes are data. Adding one = one entry here: how to read the key from a row, how to
 * name a group, and the group order.
 */
const AXES = {
  universe: {
    label: 'Universe',
    key: (r: ThemeIndexRow) => r.universe,
    name: (k: string) => UNIVERSE_TABLE.find((u) => u.id === k)?.label ?? k,
    order: UNIVERSE_TABLE.map((u) => u.id) as readonly string[],
  },
  kind: {
    label: 'Side',
    key: (r: ThemeIndexRow) => r.kind,
    name: (k: string) => ({ hero: 'Heroes', villain: 'Villains', antihero: 'Antiheroes' })[k] ?? k,
    order: ['hero', 'villain', 'antihero'],
  },
  motif: {
    label: 'Power motif',
    key: (r: ThemeIndexRow) => r.motif,
    name: (k: string) => k[0]?.toUpperCase() + k.slice(1),
    order: MOTIFS as readonly string[],
  },
  mood: {
    label: 'Mood',
    key: (r: ThemeIndexRow) => r.mood,
    name: (k: string) => (k === 'dark' ? 'Dark mode' : 'Light mode'),
    order: ['dark', 'light'],
  },
} as const;
type Axis = keyof typeof AXES;
const PREVIEW = 10;
const PAGE = 40;

/**
 * Listing only, built on the server: each group ships its first rows plus a count, and an
 * opened group pages. Packs download on "Get", never before.
 */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const axisRaw = url.searchParams.get('axis') ?? 'universe';
  const axis: Axis = axisRaw in AXES ? (axisRaw as Axis) : 'universe';
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 40);
  const open = url.searchParams.get('group');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const all = themeIndex();
  const rows = q
    ? all.filter((r) => r.name.toLowerCase().includes(q) || r.tagline.toLowerCase().includes(q))
    : all;
  const A = AXES[axis];
  const map = new Map<string, ThemeIndexRow[]>();
  for (const r of rows) map.set(A.key(r), [...(map.get(A.key(r)) ?? []), r]);
  const groups = A.order
    .filter((k) => map.has(k))
    .map((k) => {
      const list = (map.get(k) ?? []).sort((a, b) => b.heat - a.heat);
      const expanded = k === open;
      return {
        key: k,
        label: A.name(k),
        count: list.length,
        expanded,
        rows: expanded ? list.slice(0, page * PAGE) : list.slice(0, PREVIEW),
      };
    });
  return {
    axis,
    q,
    page,
    total: all.length + 1,
    groups: open ? groups.filter((g) => g.expanded) : groups,
    open,
    house: { slug: HOUSE.slug, v: packVersion(HOUSE.spec) },
  };
}

export default function Themes({ loaderData: d }: Route.ComponentProps) {
  const onFilter = useFilterSubmit();
  const [locker, setLocker] = useState<ThemePack[]>([]);
  useEffect(() => setLocker(lockerPacks()), []);
  const refresh = () => setLocker(lockerPacks());
  const qs = (extra: Record<string, string>) =>
    `?${new URLSearchParams({ axis: d.axis, ...(d.q ? { q: d.q } : {}), ...extra })}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <SectionHead level={1} kicker={`${d.total} themes`} title="Theme shop" />
      <p className="mb-8 max-w-2xl">
        Every character is a full site skin. Browse freely — nothing downloads until you hit{' '}
        <strong>Get</strong>. Pin up to five to the dock for one-tap switching.
      </p>

      <section aria-labelledby="dock-h" className="panel mb-10 space-y-4 p-5">
        <h2 id="dock-h" className="h-display text-3xl">
          Your top 5
        </h2>
        <TopFiveEditor />
      </section>

      {locker.length > 0 && (
        <section aria-labelledby="locker-h" className="mb-10">
          <h2 id="locker-h" className="h-display ink-text mb-4 text-4xl text-c1-text">
            My locker ({locker.length})
          </h2>
          <ul className="no-scrollbar flex gap-4 overflow-x-auto pb-3">
            {locker.map((p) => (
              <li key={p.slug} className="w-56 shrink-0">
                <ThemeCard
                  r={packToRow(p)}
                  downloaded
                  onRemove={() => {
                    removeFromLocker(p.slug);
                    refresh();
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Form
        method="get"
        role="search"
        className="mb-6 flex flex-wrap items-center gap-3"
        onChange={onFilter}
      >
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Group themes by</legend>
          {(Object.keys(AXES) as Axis[]).map((a) => (
            <label
              key={a}
              className="chip has-[:checked]:bg-c3 has-[:checked]:text-on-c3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-c3-text has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid"
            >
              <input
                type="radio"
                name="axis"
                value={a}
                defaultChecked={d.axis === a}
                className="sr-only"
              />
              {AXES[a].label}
            </label>
          ))}
        </fieldset>
        <label className="ml-auto block w-full sm:w-72">
          <span className="kicker mb-1 block">Search themes</span>
          <span className="relative block">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <input
              name="q"
              defaultValue={d.q}
              type="search"
              placeholder="Name or universe…"
              className="field pl-10"
            />
          </span>
        </label>
        <noscript>
          <button type="submit" className="btn btn-sm">
            Go
          </button>
        </noscript>
      </Form>

      {d.open && (
        <Link to={qs({})} preventScrollReset className="btn btn-sm mb-6">
          ← All groups
        </Link>
      )}
      <div className="space-y-12">
        {d.groups.map((g) => (
          <section key={g.key}>
            <h2 className="h-display ink-text mb-4 text-4xl text-c1-text">
              {g.label} <span className="font-head text-base text-muted">({g.count})</span>
            </h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {g.rows.map((r, i) => (
                <m.li
                  key={r.slug}
                  initial={{ y: 16 }}
                  whileInView={{ y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i % 5) * 0.03 }}
                >
                  <ThemeCard
                    r={r}
                    downloaded={locker.some((p) => p.slug === r.slug && p.v === r.v)}
                    onGet={refresh}
                  />
                </m.li>
              ))}
            </ul>
            {g.rows.length < g.count && (
              <Link
                to={qs({ group: g.key, ...(g.expanded ? { page: String(d.page + 1) } : {}) })}
                preventScrollReset
                className="btn btn-sm mt-4"
              >
                {g.expanded ? `More (${g.count - g.rows.length} left)` : `Show all ${g.count}`}
              </Link>
            )}
          </section>
        ))}
        {!d.groups.length && (
          <p className="bubble mx-auto max-w-sm text-center">No theme by that name. Yet.</p>
        )}
      </div>
      <p className="mt-10 text-muted text-sm">
        Want the house look back? <HouseButton house={d.house} />
      </p>
    </div>
  );
}

function HouseButton({ house }: { house: { slug: string; v: string } }) {
  const { equip } = useTheme();
  return (
    <button type="button" className="underline" onClick={() => equip(house)}>
      Wear the ComicMutant house theme
    </button>
  );
}

function packToRow(p: ThemePack): ThemeIndexRow {
  return {
    slug: p.slug,
    name: p.name,
    universe: p.universe,
    kind: p.kind,
    motif: p.motif,
    mood: p.mood,
    swatch: [p.vars['--c1'] ?? '#000', p.vars['--c2'] ?? '#000', p.vars['--c3'] ?? '#000'],
    tagline: p.tagline,
    heat: 0,
    v: p.v,
  };
}

/** A miniature page mock in the theme's colours — preview without downloading anything. */
function ThemeCard({
  r,
  downloaded,
  onGet,
  onRemove,
}: {
  r: ThemeIndexRow;
  downloaded: boolean;
  onGet?: () => void;
  onRemove?: () => void;
}) {
  const { equip, pin, current, top5 } = useTheme();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [c1, c2, c3] = r.swatch;
  const on = current.slug === r.slug;
  const pinned = top5.some((p) => p.slug === r.slug);
  const bg = r.mood === 'dark' ? 'var(--print-ink)' : 'var(--print-paper)';
  async function get(e: React.MouseEvent<HTMLButtonElement>, wear: boolean, doPin = false) {
    const rect = e.currentTarget.getBoundingClientRect();
    setState('busy');
    try {
      const pack = await downloadPack(r.slug, r.v);
      onGet?.();
      if (doPin) pin(pack);
      if (wear) await equip(pack, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      setState('idle');
    } catch {
      setState('error');
    }
  }
  return (
    <article className="panel group overflow-hidden">
      <div
        aria-hidden
        className="relative h-28 overflow-hidden border-line border-b-[3px]"
        style={{ background: bg }}
      >
        <div
          className="absolute inset-x-0 top-0 h-5 border-line border-b-2"
          style={{ background: c2 }}
        />
        <div
          className="absolute top-8 left-3 h-4 w-20 -rotate-2 rounded-skin-s border-2 border-line"
          style={{ background: c1 }}
        />
        <div
          className="absolute top-14 left-3 h-2 w-28 rounded-skin-s"
          style={{ background: r.mood === 'dark' ? '#f6f1e7aa' : '#16120eaa' }}
        />
        <div
          className="absolute top-[4.5rem] left-3 h-2 w-20 rounded-skin-s"
          style={{ background: r.mood === 'dark' ? '#f6f1e766' : '#16120e66' }}
        />
        <div
          className="burst absolute -right-3 -bottom-4 size-20 transition-transform duration-500 group-hover:rotate-45"
          style={{ background: c3 }}
        />
        <div
          className="absolute right-4 bottom-3 size-7 round border-2 border-line"
          style={{ background: c1 }}
        />
      </div>
      <div className="space-y-2 p-3">
        <h3 className="h-display truncate text-2xl">{r.name}</h3>
        <p className="line-clamp-2 min-h-[2.5em] text-muted text-xs">{r.tagline}</p>
        <div className="flex flex-wrap gap-1.5">
          {downloaded ? (
            <button
              type="button"
              className="btn btn-sm btn-c1"
              disabled={on || state === 'busy'}
              onClick={(e) => get(e, true)}
              aria-pressed={on}
            >
              {on ? <IconCheck className="size-4" /> : null}
              {on ? 'Wearing' : 'Equip'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-c1"
              disabled={state === 'busy'}
              onClick={(e) => get(e, true)}
            >
              <IconDownload className="size-4" />
              {state === 'busy' ? 'Getting…' : 'Get'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            disabled={pinned || state === 'busy'}
            onClick={(e) => get(e, false, true)}
            aria-label={pinned ? `Pinned: ${r.name} is in your top 5` : `Pin ${r.name} to top 5`}
          >
            <IconPin className="size-4" />
            {pinned ? 'Pinned' : 'Pin'}
          </button>
          {onRemove && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={onRemove}
              aria-label={`Remove ${r.name} from locker`}
            >
              <IconX className="size-4" />
            </button>
          )}
        </div>
        {state === 'error' && (
          <p role="alert" className="bubble flex items-center gap-1.5 text-sm">
            <IconX className="size-4 shrink-0 text-c1-text" />
            Couldn't fetch that theme. Tap Get to retry.
          </p>
        )}
      </div>
    </article>
  );
}

function TopFiveEditor() {
  const { top5, unpin, move, equip, current } = useTheme();
  return (
    <ol className="flex flex-wrap gap-3">
      <AnimatePresence initial={false}>
        {top5.map((p, i) => (
          <m.li
            key={p.slug}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className="flex items-center gap-2 round border-[3px] border-line bg-bg py-1 pr-1 pl-1"
          >
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                equip(p, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
              aria-label={`Wear ${p.name}`}
              aria-pressed={current.slug === p.slug}
              className="size-11 cursor-pointer round border-2 border-line"
              style={{
                background: `conic-gradient(${p.vars['--c1']} 0 50%, ${p.vars['--c2']} 0 80%, ${p.vars['--c3']} 0)`,
              }}
            />
            <span className="font-head text-sm">
              {i + 1}. {p.name}
            </span>
            <button
              type="button"
              className="btn btn-sm min-h-11 min-w-11 px-2"
              onClick={() => move(p.slug, -1)}
              disabled={i === 0}
              aria-label={`Move ${p.name} left`}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn btn-sm min-h-11 min-w-11 px-2"
              onClick={() => move(p.slug, 1)}
              disabled={i === top5.length - 1}
              aria-label={`Move ${p.name} right`}
            >
              ›
            </button>
            <button
              type="button"
              className="btn btn-sm min-h-11 min-w-11 px-2"
              onClick={() => unpin(p.slug)}
              disabled={top5.length <= 1}
              aria-label={`Unpin ${p.name}`}
            >
              <IconX className="size-4" />
            </button>
          </m.li>
        ))}
      </AnimatePresence>
      {top5.length < 5 && (
        <li className="self-center text-muted text-sm">
          {5 - top5.length} free slot(s) — pin a theme below.
        </li>
      )}
    </ol>
  );
}
