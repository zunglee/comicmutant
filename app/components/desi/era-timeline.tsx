import { m } from 'motion/react';
import { Link } from 'react-router';
import { useSkinMotion } from '~/skins/motion';
import type { DecadeBucket } from './logic';

/**
 * Debut decades of Indian superheroes. The line draws itself, nodes pop in, and each node is a
 * button that filters the grid to that decade. Scrolls sideways inside its own box on phones.
 */
export function EraTimeline({
  buckets,
  active,
  onPick,
}: {
  buckets: DecadeBucket[];
  active: string;
  onPick: (decade: string) => void;
}) {
  const mo = useSkinMotion();
  if (buckets.length === 0) return null;
  return (
    <section aria-labelledby="era-h" data-testid="era-timeline">
      <p className="kicker">When they debuted</p>
      <h2 id="era-h" className="h-display ink-text mb-4 text-5xl text-c1-text sm:text-6xl">
        Desi through the decades
      </h2>
      <div className="panel overflow-x-auto p-4 sm:p-6">
        <ol className="relative flex min-w-max gap-0">
          <m.span
            aria-hidden
            className="absolute top-[22px] right-0 left-0 h-1 origin-left bg-line"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={mo.tween(1.1, { ease: 'easeOut' })}
          />
          {buckets.map((b, i) => {
            const on = active === String(b.decade);
            return (
              <m.li
                key={b.decade}
                className="relative w-40 shrink-0 pr-3"
                initial={{ y: 18, scale: 0.9 }}
                whileInView={{ y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={mo.spring({ stiffness: 300, damping: 20 }, mo.delay(i, 0.07))}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={b.heroes.length === 0}
                  onClick={() => onPick(on ? '' : String(b.decade))}
                  className="btn btn-sm relative z-[1] min-h-[44px] min-w-[44px] aria-pressed:bg-c3 aria-pressed:text-on-c3"
                  aria-label={`${b.decade}s · ${b.heroes.length} ${b.heroes.length === 1 ? 'hero' : 'heroes'}`}
                >
                  {`${b.decade}s · ${b.heroes.length}`}
                </button>
                <ul className="mt-3 space-y-1 text-sm">
                  {b.heroes.slice(0, 4).map((h) => (
                    <li key={h.slug} className="truncate">
                      <Link
                        to={`/c/${h.slug}`}
                        className="inline-flex min-h-[44px] items-center underline decoration-c1 decoration-2 underline-offset-2"
                      >
                        {h.name} <span className="ml-1 text-muted">{h.year}</span>
                      </Link>
                    </li>
                  ))}
                  {b.heroes.length > 4 && (
                    <li className="text-muted">+{b.heroes.length - 4} more</li>
                  )}
                </ul>
              </m.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
