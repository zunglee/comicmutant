import { m } from 'motion/react';
import { Link } from 'react-router';
import { allFighters } from '~/.server/content';
import { KindTag, SectionHead } from '~/components/bits';
import { SpriteClip } from '~/components/sprite';
import { scopeVars } from '~/lib/theme/compute';
import type { Route } from './+types/originals';

export const meta: Route.MetaFunction = () => [
  { title: 'CM Originals — ComicMutant' },
  { name: 'description', content: "ComicMutant's own heroes and villains: the cast of the Arena." },
];

export function loader() {
  return { fighters: allFighters() };
}

export default function Originals({ loaderData: d }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <SectionHead
        level={1}
        kicker={`${d.fighters.length} originals`}
        title="CM Originals"
        action={
          <Link to="/arena" className="btn btn-c1">
            Fight with them
          </Link>
        }
      />
      <p className="mb-8 max-w-2xl">
        Our own cast — drawn, animated and voiced by nobody but us. They're the only ones who step
        into the Arena.
      </p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {d.fighters.map((f, i) => (
          <m.li
            key={f.slug}
            initial={{ y: 24 }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: (i % 5) * 0.03 }}
          >
            <Link
              to={`/originals/${f.slug}`}
              style={scopeVars(f.theme.palette) as React.CSSProperties}
              className="panel group block overflow-hidden transition-transform hover:-translate-y-1 hover:rotate-1"
            >
              <div className="border-line border-b-[3px]">
                <SpriteClip
                  decorative
                  hoverPlay
                  fighter={f}
                  pose={i % 3 === 0 ? 'special' : i % 3 === 1 ? 'idle' : 'punch'}
                />
              </div>
              <div className="space-y-1 p-3">
                <KindTag kind={f.kind} />
                <p className="h-display text-2xl">{f.alias}</p>
                <p className="text-muted text-xs">{f.name}</p>
              </div>
            </Link>
          </m.li>
        ))}
      </ul>
    </div>
  );
}
