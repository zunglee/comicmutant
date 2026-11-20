import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSkinMotion } from '~/skins/motion';
import { hostOf } from './logic';

export interface DayFact {
  text: string;
  kind: string;
  source: string;
  slug: string;
  name: string;
}

/** Today's pick, plus "Another one" through a handful chosen on the server. */
export function FactOfDay({ facts }: { facts: DayFact[] }) {
  const mo = useSkinMotion();
  const [i, setI] = useState(0);
  const f = facts[i % Math.max(1, facts.length)];
  if (!f) return null;
  return (
    <section aria-labelledby="fod-h" className="panel halftone space-y-4 p-6 sm:p-8">
      <p className="kicker">Fact of the day</p>
      <h2 id="fod-h" className="h-display text-4xl sm:text-5xl">
        Did you know?
      </h2>
      <div aria-live="polite" className="min-h-[7rem]">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={i}
            initial={{ y: 14, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -8, transition: mo.tween(0.1) }}
            transition={mo.spring({ stiffness: 320, damping: 24 })}
            className="space-y-3"
          >
            <p className="text-xl leading-snug">{f.text}</p>
            <p className="text-sm">
              About{' '}
              <Link to={`/c/${f.slug}`} className="font-head underline">
                {f.name}
              </Link>{' '}
              ·{' '}
              <a href={f.source} target="_blank" rel="noreferrer noopener" className="underline">
                source: {hostOf(f.source)}
              </a>
            </p>
          </m.div>
        </AnimatePresence>
      </div>
      {facts.length > 1 && (
        <button type="button" className="btn btn-c1" onClick={() => setI((n) => n + 1)}>
          Another one
        </button>
      )}
    </section>
  );
}
