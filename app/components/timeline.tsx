/**
 * Timeline pieces (Motion): a spine that fills as you scroll, milestone cards that swing in from
 * their side (heroes left, villains right), and a compact per-character strip for /c/:slug.
 * Every card wears its character's colours via scopeVars, so the river reads at a glance.
 */
import { m, useScroll, useSpring } from 'motion/react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { useAnimate } from '~/lib/fx';
import type { Milestone } from '~/lib/schema';
import { scopeVars } from '~/lib/theme/compute';
import { IconVs } from './icons';

export const MILESTONE_LABEL: Record<Milestone['kind'], string> = {
  debut: 'Debut',
  comic: 'Comic',
  screen: 'Screen',
  turn: 'Turning point',
  death: 'Death',
  return: 'Comeback',
  legacy: 'Legacy',
};

export interface TimelineItem extends Milestone {
  id: string;
  slug: string;
  name: string;
  side: 'hero' | 'rogue';
  palette: { c1: string; c2: string; c3: string };
  withName?: string;
}

/** Year groups along a centre spine. Heroes on the left, villains/antiheroes on the right. */
export function Spine({ items }: { items: TimelineItem[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const animate = useAnimate();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 70%', 'end 60%'] });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  const years = [...new Set(items.map((i) => i.year))];
  return (
    <ol ref={ref} className="relative space-y-10 py-4">
      {/* The spine: an ink track with a fill that follows the scroll (transform only). */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 left-5 w-2 -translate-x-1/2 rounded-skin-pill border-skin-s border-line bg-card md:left-1/2"
      />
      <m.div
        aria-hidden
        className="absolute top-0 bottom-0 left-5 w-1 origin-top -translate-x-1/2 bg-c3 md:left-1/2"
        style={{ scaleY: animate ? fill : 1 }}
      />
      {years.map((y) => {
        const here = items.filter((i) => i.year === y);
        return (
          <li key={y} className="relative">
            <m.p
              className="h-display relative z-10 ml-10 inline-block tilt-skin-2 border-skin border-line bg-c1 px-3 text-3xl text-on-c1 md:mx-auto md:block md:w-fit"
              initial={animate ? { scale: 0.6, rotate: -12 } : false}
              whileInView={{ scale: 1, rotate: -2 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            >
              {y}
            </m.p>
            <ul className="mt-4 grid gap-4 md:grid-cols-2 md:gap-x-16">
              {here.map((it, i) => (
                <MilestoneCard key={it.id} it={it} index={i} />
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function MilestoneCard({ it, index }: { it: TimelineItem; index: number }) {
  const animate = useAnimate();
  const left = it.side === 'hero';
  return (
    <m.li
      className={`relative ml-10 md:ml-0 ${left ? 'md:col-start-1' : 'md:col-start-2'}`}
      initial={animate ? { x: left ? -50 : 50, rotate: left ? -3 : 3, opacity: 0 } : false}
      whileInView={{ x: 0, rotate: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: (index % 4) * 0.05 }}
      style={scopeVars(it.palette) as React.CSSProperties}
    >
      {/* Connector tick to the spine. */}
      <span
        aria-hidden
        className={`absolute top-6 hidden h-(--border-w) w-8 bg-line md:block ${left ? '-right-8' : '-left-8'}`}
      />
      <article className="panel border-l-[10px] border-l-c1 p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="border-2 border-line bg-c3 px-1.5 font-head text-on-c3 text-xs uppercase">
            {MILESTONE_LABEL[it.kind]}
          </span>
          <Link
            to={`/c/${it.slug}`}
            className="h-display inline-flex min-h-11 items-center text-xl text-c1-text-card hover:underline"
          >
            {it.name}
          </Link>
          <span className="sr-only">({left ? 'hero' : 'villain or antihero'})</span>
        </div>
        <h3 className="h-head text-lg">{it.title}</h3>
        <p className="text-sm">{it.note}</p>
        {it.with && it.withName && (
          <Link
            to={`/c/${it.with}`}
            className="chip mt-2 text-xs"
            aria-label={`With ${it.withName}`}
          >
            <IconVs className="size-4" /> with {it.withName}
          </Link>
        )}
      </article>
    </m.li>
  );
}

/** Per-character strip for /c/:slug: a horizontal rail of dated beats that pops in one by one. */
export function MilestoneStrip({ items }: { items: Milestone[] }) {
  const animate = useAnimate();
  return (
    // Focusable so keyboard users can scroll the strip (it holds no links of its own).
    <ol
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region must be keyboard-reachable.
      tabIndex={0}
      aria-label="Milestones, oldest first (scroll sideways)"
      className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pt-6 pb-4"
    >
      {items.map((it, i) => (
        <m.li
          key={`${it.year}-${it.title}`}
          className="relative w-64 shrink-0 snap-start"
          initial={animate ? { y: 30, opacity: 0 } : false}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.06 }}
        >
          {/* Rail + dot. */}
          <span aria-hidden className="absolute -top-3 right-0 left-0 h-(--border-w) bg-line" />
          <span
            aria-hidden
            className="absolute -top-[18px] left-4 size-4 rounded-skin-pill border-skin border-line bg-c3"
          />
          <article className="panel h-full p-4">
            <p className="h-display text-3xl text-c1-text-card">{it.year}</p>
            <p className="kicker text-card-fg!">{MILESTONE_LABEL[it.kind]}</p>
            <h3 className="h-head text-base">{it.title}</h3>
            <p className="text-sm">{it.note}</p>
          </article>
        </m.li>
      ))}
    </ol>
  );
}
