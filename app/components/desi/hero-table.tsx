import { Link } from 'react-router';
import { type DesiCardData, mediumLabel } from './logic';

/** Compact "all heroes" view: one row per hero, the wiki-style index. */
export function HeroTable({ rows }: { rows: readonly DesiCardData[] }) {
  return (
    <section
      // Scrollable region: focusable so keyboard users can reach the Creators and Facts columns.
      aria-label="Heroes table"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be focusable
      tabIndex={0}
      className="panel overflow-x-auto focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-c3"
      data-testid="desi-table"
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">
          Indian superheroes: publisher, debut year and creators
        </caption>
        <thead>
          <tr className="border-line border-b-[3px] font-head text-xs uppercase tracking-wider">
            <th scope="col" className="p-3">
              Name
            </th>
            <th scope="col" className="p-3">
              Publisher
            </th>
            <th scope="col" className="p-3">
              Medium
            </th>
            <th scope="col" className="p-3">
              Debut
            </th>
            <th scope="col" className="p-3">
              Creators
            </th>
            <th scope="col" className="p-3 text-right">
              Facts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.slug} className="border-line/30 border-b">
              <th scope="row" className="p-0 font-normal">
                <Link
                  to={`/c/${c.slug}`}
                  className="flex min-h-[44px] items-center px-3 font-head underline"
                >
                  {c.name}
                  <span className="sr-only"> ({c.kind})</span>
                </Link>
              </th>
              <td className="p-3">{c.group}</td>
              <td className="p-3">{mediumLabel(c.medium)}</td>
              <td className="p-3">{c.year}</td>
              <td className="p-3">{c.creators.slice(0, 3).join(', ')}</td>
              <td className="p-3 text-right">{c.factCount || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
