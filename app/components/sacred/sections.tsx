/** Page sections for Sacred India: hero bloom, tradition doors, search, chips, reveals. */
import { m, useScroll, useTransform } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Form, Link } from 'react-router';
import { useReducedMotion } from '~/lib/fx';
import { skinVars } from '~/skins/compute';
import { sacred } from '~/skins/sacred';
import { CardGrid } from './figure-card';
import { MOTIFS, SymbolArt } from './symbol-art';
import { type CardRow, type SacredCardData, TRADITION_LOOK } from './types';

/**
 * Fades its children up when scrolled to. Content is visible in the server HTML: only blocks that
 * start below the fold are hidden after hydration, then released by an IntersectionObserver.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'plain' | 'armed' | 'in'>('plain');
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState('armed');
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        setState('in');
        io.disconnect();
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  return (
    <div
      ref={ref}
      className={`${state === 'plain' ? '' : 'reveal-armed'} ${state === 'in' ? 'reveal-in' : ''} ${className}`}
      style={{ '--rv-d': `${delay}s` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** Lotus pink at a given strength over the card colour; the tones follow the skin's --c2. */
const petalTone = (pct: number) => `color-mix(in srgb, var(--c2) ${pct}%, var(--card))`;
const GLOW_TONE = 'color-mix(in srgb, var(--c1) 40%, var(--card))';

/** A lotus that opens petal by petal, then sways like it is on still water. */
export function LotusBloom({ className = '' }: { className?: string }) {
  // Outer petals first so inner ones open over them.
  const petals = [
    { d: MOTIFS.lotus[3], r: -18, fill: petalTone(55) },
    { d: MOTIFS.lotus[4], r: 18, fill: petalTone(55) },
    { d: MOTIFS.lotus[1], r: -12, fill: petalTone(48) },
    { d: MOTIFS.lotus[2], r: 12, fill: petalTone(48) },
    { d: MOTIFS.lotus[0], r: 0, fill: petalTone(25) },
  ];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id="bloom-glow">
          <stop offset="0" style={{ stopColor: GLOW_TONE }} stopOpacity="0.8" />
          <stop offset="1" style={{ stopColor: GLOW_TONE }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="52" r="48" fill="url(#bloom-glow)" className="sym-halo sym-live" />
      <g className="bloom-sway">
        {petals.map((p, i) => (
          <path
            key={p.d}
            d={p.d}
            style={
              {
                fill: p.fill,
                stroke: 'var(--c2)',
                '--bd': `${0.3 + i * 0.5}s`,
                '--br': `${p.r}deg`,
              } as React.CSSProperties
            }
            fillOpacity="0.55"
            strokeWidth="0.9"
            strokeLinejoin="round"
            className="bloom-petal"
          />
        ))}
        <path
          d="M22 86 C38 92 62 92 78 86"
          fill="none"
          strokeWidth="1.2"
          strokeLinecap="round"
          className="bloom-petal"
          style={{ stroke: 'var(--c3)', '--bd': '2.6s' } as React.CSSProperties}
        />
      </g>
    </svg>
  );
}

export function SearchBox({ q, label = 'Find a figure' }: { q?: string; label?: string }) {
  return (
    <Form
      method="get"
      action="/sacred"
      role="search"
      className="mx-auto flex w-full max-w-xl gap-2"
    >
      <label htmlFor="sacred-q" className="sr-only">
        {label}
      </label>
      <input
        id="sacred-q"
        name="q"
        type="search"
        defaultValue={q ?? ''}
        placeholder="Search a name, e.g. Ganesha"
        autoComplete="off"
        className="field min-w-0 flex-1 bg-card!"
      />
      <button type="submit" className="btn btn-c3">
        Search
      </button>
    </Form>
  );
}

export interface DoorData {
  id: string;
  label: string;
  blurb: string;
  ready: number;
  total: number;
}

const DRIFT = [26, -14, 34, -22];

/** The four traditions as doors; each drifts at its own slow pace as the page scrolls. */
const SM = '(min-width: 640px)';
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(SM);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(SM).matches,
    () => false,
  );
}

export function TraditionDoors({ doors }: { doors: DoorData[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // One column on a phone: drifting doors would overlap their neighbours, so they stay put there.
  const motionOff = useReducedMotion();
  const wide = useWide();
  const reduced = motionOff || !wide;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  return (
    <div ref={ref} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {doors.map((d, i) => (
        <Door
          key={d.id}
          d={d}
          drift={reduced ? 0 : (DRIFT[i] ?? 0)}
          progress={scrollYProgress}
          i={i}
        />
      ))}
    </div>
  );
}

function Door({
  d,
  drift,
  progress,
  i,
}: {
  d: DoorData;
  drift: number;
  progress: ReturnType<typeof useScroll>['scrollYProgress'];
  i: number;
}) {
  const y = useTransform(progress, [0, 1], [drift, -drift]);
  const look = TRADITION_LOOK[d.id as keyof typeof TRADITION_LOOK];
  return (
    <m.div style={{ y }} className="sr-rise" data-door={d.id}>
      <Link
        to={`/sacred/${d.id}`}
        className="sacred-door"
        style={
          {
            '--sc-a': look.c1,
            '--sc-b': look.c2,
            '--d': `${0.2 + i * 0.18}s`,
          } as React.CSSProperties
        }
      >
        <span className="block size-24">
          <SymbolArt symbol={look.symbol} c1={look.c1} c2={look.c2} />
        </span>
        <span className="h-display text-4xl">{d.label}</span>
        <span className="text-sm text-muted">{d.blurb}</span>
        <span className="mt-auto pt-2 text-c1-text text-sm font-semibold">
          {d.ready} of {d.total} profiles ready
        </span>
      </Link>
    </m.div>
  );
}

export function SectionTitle({
  kicker,
  title,
  id,
  children,
}: {
  id?: string;
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-1">
      {kicker && <p className="kicker">{kicker}</p>}
      <h2 id={id} className="h-display text-4xl sm:text-5xl">
        {title}
      </h2>
      {children && <p className="max-w-prose text-muted">{children}</p>}
    </div>
  );
}

export function ChipRow({
  label,
  items,
}: {
  label: string;
  items: { text: string; to?: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={label} className="space-y-2">
      <h3 className="kicker">{label}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((it) => (
          <li key={it.text}>
            {it.to ? (
              <Link to={it.to} className="sacred-chip">
                {it.text}
              </Link>
            ) : (
              <span className="sacred-chip">{it.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Respect() {
  return (
    <p className="panel p-4 text-muted text-sm">
      This page tells what the tradition says, in our own words, and links its sources. Where
      tellings differ we name them and never rank them. We show no pictures of deities, Gurus or
      saints: the pattern above is an original, generic design. If something here is wrong, the
      sources are linked so it can be checked and corrected.
    </p>
  );
}

export const FIRST_ROW = 4;

/** Lineages with a fixed order are never collapsed or ranked-by-position: all cards, numbered. */
export const ORDERED_GROUPS = ['guru', 'tirthankara', 'avatar'];

/**
 * A group collapsed to its first row of cards. The rest sit in a <details>, so "Show all N" works
 * with no JavaScript at all; they are light link tiles (name, role), and each opens its profile.
 */
export function GroupCards({
  id,
  cards,
  more,
}: {
  id: string;
  cards: SacredCardData[];
  more: CardRow[];
}) {
  return (
    <div>
      <CardGrid cards={cards} ordered={ORDERED_GROUPS.includes(id)} />
      {more.length > 0 && (
        <details className="sacred-more mt-5" id={`more-${id}`}>
          <summary className="btn sacred-more-btn">
            <span className="sm-closed">Show all {cards.length + more.length}</span>
            <span className="sm-open">Show fewer</span>
          </summary>
          <ul className="sacred-tiles">
            {more.map((r) => (
              <li key={r.slug}>
                {r.ready ? (
                  <Link to={`/sacred/f/${r.slug}`} className="sacred-tile">
                    <span className="sc-name">{r.name}</span>
                    {r.native && <span className="sc-native">{r.native}</span>}
                  </Link>
                ) : (
                  <span className="sacred-tile sacred-tile-soon">
                    <span className="sc-name">{r.name}</span>
                    <span className="sc-role">Profile coming soon</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * The door keeps the realm's look on any page: it carries the sacred skin's own tokens (a few of
 * them, not the whole set) so no colour, face or radius is written twice.
 */
const BANNER_TOKENS = [
  '--bg',
  '--fg',
  '--card',
  '--muted',
  '--line',
  '--c1',
  '--c2',
  '--c3',
  '--on-c3',
  '--c3-text',
  '--font-body',
  '--font-display',
  '--display-weight',
  '--radius-m',
  '--radius-s',
  '--ease-out',
  '--dur-slow',
] as const;
const BANNER_VARS = Object.fromEntries(
  BANNER_TOKENS.map((k) => [k, skinVars(sacred)[k]]),
) as React.CSSProperties;

/** A calm door on the comic home page: ivory, slow lotus, one link into the realm. */
export function SacredDoorBanner() {
  return (
    <section aria-labelledby="sacred-door-h" className="mx-auto max-w-7xl px-4 pt-20">
      <Link to="/sacred" className="sacred-banner" style={BANNER_VARS}>
        <span className="sacred-banner-art" aria-hidden>
          <SymbolArt symbol="lotus" c1="var(--c1)" c2="var(--c2)" />
        </span>
        <span className="sacred-banner-text">
          <span className="sacred-banner-kicker">A quieter place</span>
          <span id="sacred-door-h" className="sacred-banner-title">
            Sacred India
          </span>
          <span className="sacred-banner-copy">
            Meet the figures of India’s Hindu, Buddhist, Jain and Sikh traditions, at a slower pace.
          </span>
        </span>
        <span className="sacred-banner-go">Step inside</span>
      </Link>
    </section>
  );
}
