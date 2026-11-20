/**
 * /gadgets/:slug — one gadget dissected. The blueprint stays pinned while the parts list scrolls past
 * it: the part whose card is in view pulls out of the assembly and lights up (scrollytelling). Tap a
 * part, or its card, to pick it; "Assemble" snaps everything back together.
 */
import { m } from 'motion/react';
import { useRef, useState } from 'react';
import { data, Link } from 'react-router';
import { allGadgets, getCharacter } from '~/.server/content';
import { Disclaimer } from '~/components/bits';
import { Blueprint } from '~/components/gadgets';
import { IconArrow } from '~/components/icons';
import { useAnimate } from '~/lib/fx';
import { scopeVars } from '~/lib/theme/compute';
import type { Route } from './+types/gadget';

export function loader({ params }: Route.LoaderArgs) {
  const all = allGadgets();
  const i = all.findIndex((x) => x.slug === params.slug);
  const g = all[i];
  if (!g) throw data('That gadget is not in the lab.', { status: 404 });
  const o = getCharacter(g.owner);
  const next = all[(i + 1) % all.length];
  return {
    g,
    owner: o
      ? { slug: o.slug, name: o.name, palette: o.theme.palette }
      : { slug: g.owner, name: g.owner, palette: { c1: '#ff2e4d', c2: '#1b1464', c3: '#ffd400' } },
    next: next && next.slug !== g.slug ? { slug: next.slug, name: next.name } : null,
  };
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${loaderData.g.name}, dissected — Gadget Lab · ComicMutant` },
        { name: 'description', content: loaderData.g.summary },
      ]
    : [{ title: 'Not found — ComicMutant' }];

export default function GadgetPage({ loaderData: d }: Route.ComponentProps) {
  const { g, owner } = d;
  const animate = useAnimate();
  const [active, setActive] = useState<number | null>(null);
  const [apart, setApart] = useState(true);
  // A tap or click pins the pick for a moment, so scrolling the tapped card into view doesn't let
  // the next card's viewport-enter steal the selection.
  const pinnedUntil = useRef(0);
  const pick = (i: number) => {
    pinnedUntil.current = Date.now() + 1500;
    setActive(i);
  };
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-10"
      style={scopeVars(owner.palette) as React.CSSProperties}
    >
      <Link to="/gadgets" className="kicker inline-flex min-h-11 items-center hover:underline">
        ← Gadget Lab
      </Link>
      <header className="mb-8">
        <p className="kicker">
          <Link to={`/c/${owner.slug}`} className="hover:underline">
            {owner.name}
          </Link>{' '}
          · first seen {g.firstSeen.year}, {g.firstSeen.title}
        </p>
        <h1 className="h-display ink-text text-[clamp(2.6rem,7vw,5rem)] text-c1-text">{g.name}</h1>
        <p className="max-w-2xl text-lg">{g.summary}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        {/* Pinned blueprint (sticky under the header on every size). */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel overflow-hidden p-0">
            <Blueprint
              kind={g.blueprint}
              explode={apart ? 1 : 0}
              active={active}
              onPick={pick}
              labels={g.parts.map((p) => p.label)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-c1"
              aria-pressed={apart}
              onClick={() => setApart((v) => !v)}
            >
              {apart ? 'Assemble' : 'Explode'}
            </button>
            {active !== null && (
              <button type="button" className="btn" onClick={() => setActive(null)}>
                Clear pick
              </button>
            )}
          </div>
        </div>

        <ol className="space-y-4" aria-label="Parts">
          {g.parts.map((p, i) => {
            const on = active === i;
            return (
              <m.li
                key={p.label}
                initial={animate ? { x: 40, opacity: 0 } : false}
                whileInView={{ x: 0, opacity: 1 }}
                viewport={{ amount: 0.6 }}
                // Scrollytelling: the card in view pulls its part out of the blueprint.
                onViewportEnter={() => {
                  if (Date.now() > pinnedUntil.current) setActive(i);
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                <button
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={on}
                  className={`panel block w-full p-4 text-left transition-transform ${on ? '-translate-y-1 outline-4 outline-c3 outline-offset-2' : ''}`}
                >
                  <span className="flex items-baseline gap-3">
                    <span className="h-display grid size-10 shrink-0 place-items-center round border-[3px] border-line bg-c3 text-xl text-on-c3">
                      {i + 1}
                    </span>
                    <span>
                      <span className="h-head block text-lg">{p.label}</span>
                      <span className="block text-sm">{p.fact}</span>
                    </span>
                  </span>
                </button>
              </m.li>
            );
          })}
        </ol>
      </div>

      <section aria-labelledby="trivia-h" className="mt-16 grid gap-6 lg:grid-cols-2">
        <div className="panel halftone space-y-3 p-6">
          <h2 id="trivia-h" className="h-display text-4xl">
            Lab notes
          </h2>
          <ul className="space-y-3">
            {g.trivia.map((t) => (
              <li key={t} className="bubble text-base">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Sources:{' '}
            {g.sources.map((s, i) => (
              <span key={s}>
                {i > 0 && ' · '}
                <a href={s} rel="noopener noreferrer" target="_blank" className="underline">
                  {new URL(s).hostname.replace(/^www\./, '')}
                </a>
              </span>
            ))}
          </p>
          {d.next && (
            <Link to={`/gadgets/${d.next.slug}`} className="btn btn-c1">
              Next on the bench: {d.next.name} <IconArrow />
            </Link>
          )}
          <Disclaimer />
        </div>
      </section>
    </div>
  );
}
