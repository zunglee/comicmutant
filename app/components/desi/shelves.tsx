import { m } from 'motion/react';
import { Link } from 'react-router';
import { scopeVars } from '~/lib/theme/compute';
import { useSkinMotion } from '~/skins/motion';
import type { DesiCardData, Facet } from './logic';

/** One shelf per publisher: a sideways row of spines. The row scrolls inside its own box. */
export function Shelves({
  heroes,
  groups,
  onOpen,
}: {
  heroes: readonly DesiCardData[];
  groups: Facet[];
  onOpen: (group: string) => void;
}) {
  const mo = useSkinMotion();
  return (
    <section aria-labelledby="shelf-h" data-testid="desi-shelves">
      <p className="kicker">Browse by house</p>
      <h2 id="shelf-h" className="h-display ink-text mb-4 text-5xl text-c1-text sm:text-6xl">
        The shelves
      </h2>
      <div className="space-y-5">
        {groups.map((g, gi) => {
          const items = heroes
            .filter((h) => h.group === g.value)
            .sort((a, b) => a.year - b.year)
            .slice(0, 12);
          return (
            <m.div
              key={g.value}
              className="panel overflow-hidden"
              initial={{ y: 20 }}
              whileInView={{ y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={mo.spring({ stiffness: 240, damping: 22 }, mo.delay(gi, 0.03))}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-line border-b-[3px] px-4 py-2">
                <h3 className="h-head text-xl">
                  {g.value} <span className="text-muted text-sm">({g.count})</span>
                </h3>
                <button type="button" className="btn btn-sm" onClick={() => onOpen(g.value)}>
                  See all
                </button>
              </div>
              <ul className="flex gap-3 overflow-x-auto p-3">
                {items.map((h, i) => (
                  <m.li
                    key={h.slug}
                    className="shrink-0 list-none"
                    initial={{ x: 16 }}
                    whileInView={{ x: 0 }}
                    viewport={{ once: true }}
                    transition={mo.spring({ stiffness: 300, damping: 22 }, mo.delay(i, 0.04))}
                  >
                    <Link
                      to={`/c/${h.slug}`}
                      style={scopeVars(h.palette) as React.CSSProperties}
                      className="panel flex min-h-[88px] w-28 flex-col justify-between overflow-hidden transition-transform hover:-translate-y-1"
                    >
                      <span aria-hidden className="block h-3 w-full bg-c1" />
                      <span className="h-display px-2 pt-1 text-lg leading-tight">{h.name}</span>
                      <span className="px-2 pb-1 font-head text-muted text-xs">{h.year}</span>
                    </Link>
                  </m.li>
                ))}
              </ul>
            </m.div>
          );
        })}
      </div>
    </section>
  );
}
