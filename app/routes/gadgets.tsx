/**
 * /gadgets — Gadget Lab index: every famous gadget as a small assembled blueprint that pops apart on
 * hover/focus. Facts only; the drawings are original generic schematics (see components/gadgets.tsx).
 */
import { m } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { allGadgets, getCharacter } from '~/.server/content';
import { Disclaimer, SectionHead } from '~/components/bits';
import { Blueprint } from '~/components/gadgets';
import { useAnimate } from '~/lib/fx';
import { scopeVars } from '~/lib/theme/compute';
import type { Route } from './+types/gadgets';

export const meta: Route.MetaFunction = () => [
  { title: 'Gadget Lab — ComicMutant' },
  {
    name: 'description',
    content:
      'Famous superhero gadgets taken apart: animated exploded blueprints with a fact on every part.',
  },
];

export function loader() {
  return {
    gadgets: allGadgets().map((g) => {
      const o = getCharacter(g.owner);
      return {
        slug: g.slug,
        name: g.name,
        blueprint: g.blueprint,
        year: g.firstSeen.year,
        summary: g.summary,
        owner: o?.name ?? g.owner,
        palette: o?.theme.palette ?? { c1: '#ff2e4d', c2: '#1b1464', c3: '#ffd400' },
      };
    }),
  };
}

export default function GadgetLab({ loaderData: d }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <SectionHead
        level={1}
        kicker={`${d.gadgets.length} gadgets · hover to pull them apart`}
        title="Gadget Lab"
      />
      <p className="mb-8 max-w-2xl">
        The most famous kit in comics, dissected: every part gets a fact. Blueprints are our own
        generic schematics, not the published designs.
      </p>
      {d.gadgets.length ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {d.gadgets.map((g, i) => (
            <Card key={g.slug} g={g} i={i} />
          ))}
        </ul>
      ) : (
        <p className="panel p-6">The lab is restocking. Check back soon.</p>
      )}
      <Disclaimer />
    </div>
  );
}

function Card({ g, i }: { g: Route.ComponentProps['loaderData']['gadgets'][number]; i: number }) {
  const [open, setOpen] = useState(false);
  const animate = useAnimate();
  return (
    <m.li
      initial={animate ? { y: 30, opacity: 0 } : false}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: (i % 3) * 0.06 }}
      style={scopeVars(g.palette) as React.CSSProperties}
    >
      <Link
        to={`/gadgets/${g.slug}`}
        className="panel group block overflow-hidden transition-transform hover:-translate-y-1"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <div className="border-line border-b-[3px]">
          <Blueprint kind={g.blueprint} explode={open ? 0.55 : 0} active={null} />
        </div>
        <div className="space-y-1 p-4">
          <p className="kicker">
            {g.owner} · {g.year}
          </p>
          <h2 className="h-display text-3xl">{g.name}</h2>
          <p className="text-muted text-sm">{g.summary}</p>
        </div>
      </Link>
    </m.li>
  );
}
