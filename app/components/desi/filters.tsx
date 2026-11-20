import { type DesiFilter, type DesiView, type Facet, mediumLabel, NO_FILTER, SORTS } from './logic';

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

function Sel({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  all?: string;
}) {
  return (
    <label className="block">
      <span className="kicker mb-1 block">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== undefined && <option value="">{all}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DesiFilters({
  f,
  set,
  groups,
  mediums,
  eras,
  total,
  shown,
  letters,
  view,
  setView,
}: {
  f: DesiFilter;
  set: (patch: Partial<DesiFilter>) => void;
  groups: Facet[];
  mediums: string[];
  eras: number[];
  total: number;
  shown: number;
  letters: Set<string>;
  view: DesiView;
  setView: (v: DesiView) => void;
}) {
  const dirty = JSON.stringify(f) !== JSON.stringify(NO_FILTER);
  return (
    <section aria-labelledby="filter-h" className="panel space-y-4 p-4" data-testid="desi-filters">
      <h2 id="filter-h" className="sr-only">
        Filter the heroes
      </h2>
      <div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="kicker mb-2 p-0">Publisher or studio</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="chip"
              aria-pressed={f.group === ''}
              onClick={() => set({ group: '' })}
            >
              All ({total})
            </button>
            {groups.map((g) => (
              <button
                key={g.value}
                type="button"
                className="chip"
                aria-pressed={f.group === g.value}
                onClick={() => set({ group: f.group === g.value ? '' : g.value })}
              >
                {g.value} ({g.count})
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="kicker mb-1 block">Search</span>
          <input
            type="search"
            className="field"
            value={f.q}
            maxLength={40}
            placeholder="Name, alter ego, team…"
            onChange={(e) => set({ q: e.target.value })}
          />
        </label>
        <Sel
          label="Medium"
          value={f.medium}
          all="All media"
          onChange={(v) => set({ medium: v })}
          options={mediums.map((m) => [m, mediumLabel(m)])}
        />
        <Sel
          label="Era"
          value={f.era}
          all="All eras"
          onChange={(v) => set({ era: v })}
          options={eras.map((d) => [String(d), `${d}s`])}
        />
        <Sel
          label="Side"
          value={f.kind}
          all="All sides"
          onChange={(v) => set({ kind: v })}
          options={[
            ['hero', 'Hero'],
            ['villain', 'Villain'],
            ['antihero', 'Antihero'],
          ]}
        />
        <Sel
          label="Sort"
          value={f.sort}
          onChange={(v) => set({ sort: v as DesiFilter['sort'] })}
          options={Object.entries(SORTS)}
        />
      </div>
      <nav aria-label="A to Z index">
        <p className="kicker mb-2">A–Z index</p>
        <ul className="flex flex-wrap gap-1">
          {LETTERS.map((l) => {
            const has = letters.has(l);
            return (
              <li key={l}>
                <button
                  type="button"
                  className="chip min-h-[44px] min-w-[44px] justify-center disabled:opacity-40"
                  aria-pressed={f.letter === l}
                  disabled={!has}
                  aria-label={
                    l === '#' ? 'Names starting with a digit or symbol' : `Names starting with ${l}`
                  }
                  onClick={() => set({ letter: f.letter === l ? '' : l })}
                >
                  {l}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" data-testid="desi-count" className="font-head">
          Showing {shown} of {total}
        </p>
        <div className="flex flex-wrap gap-2">
          <fieldset className="m-0 flex gap-1 border-0 p-0">
            <legend className="sr-only">View</legend>
            {(['grid', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="chip min-h-[44px]"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'grid' ? 'Cards' : 'Table'}
              </button>
            ))}
          </fieldset>
          {dirty && (
            <button type="button" className="btn btn-sm" onClick={() => set(NO_FILTER)}>
              Clear filters
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
