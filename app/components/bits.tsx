/** Shared building blocks: motif clips, character cards, section heads, scratch cards. */
import { m } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ClipCanvas } from '~/lib/clips/ClipCanvas';
import { DROPPED_MOTIF } from '~/lib/clips/gate';
import type { ClipParams } from '~/lib/clips/registry';
import { photoSrc, photoSrcSet } from '~/lib/photos';
import { UNIVERSE_LABEL, type Universe } from '~/lib/taxonomy';
import { scopeVars } from '~/lib/theme/compute';

type Registry = typeof import('~/lib/clips/registry');
let registry: Promise<Registry> | undefined;
let loaded: Registry | undefined;

/** The 20 recipes (~7 KB gz) load after first paint, once, for every clip on the page. */
function useRegistry(): Registry | undefined {
  const [reg, setReg] = useState(loaded);
  useEffect(() => {
    if (loaded) return;
    registry ??= import('~/lib/clips/registry').then((m) => {
      loaded = m;
      return m;
    });
    let live = true;
    registry.then((m) => live && setReg(m));
    return () => {
      live = false;
    };
  }, []);
  return reg;
}

export function MotifClip({
  params,
  kind,
  aspect = 1,
  className = '',
  save = false,
  autoPlay,
  decorative,
  hoverPlay,
}: {
  params: ClipParams;
  kind: string;
  aspect?: number;
  className?: string;
  save?: boolean;
  autoPlay?: boolean;
  decorative?: boolean;
  hoverPlay?: boolean;
}) {
  const reg = useRegistry();
  // A kind the quality gate dropped never renders; fall back to the splash page.
  const id = DROPPED_MOTIF.includes(kind) ? 'splash' : kind;
  const recipe = reg && (reg.CLIP_BY_ID.get(id) ?? reg.CLIP_BY_ID.get('splash'));
  // biome-ignore lint/correctness/useExhaustiveDependencies: params is compared by value.
  const draw = useMemo(
    () => recipe?.make(params),
    [recipe, params.c1, params.c2, params.c3, params.motif, params.name, params.year],
  );
  if (!recipe || !draw) {
    // Same box, palette-tinted, until the recipes arrive: no layout shift, no blank flash.
    return (
      <div
        aria-hidden
        className={className}
        style={{
          aspectRatio: String(aspect),
          background: `radial-gradient(circle at 50% 45%, ${params.c3} 0 12%, ${params.c1} 13% 40%, ${params.c2} 41%)`,
        }}
      />
    );
  }
  return (
    <ClipCanvas
      draw={draw}
      label={`${params.name}: ${recipe.label} animation`}
      aspect={aspect}
      className={className}
      loop={recipe.loop}
      autoPlay={autoPlay}
      decorative={decorative}
      hoverPlay={hoverPlay}
      saveName={
        save ? `${params.name}-${recipe.id}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') : undefined
      }
    />
  );
}

export function UniverseTag({ u }: { u: Universe | string }) {
  return <span className="chip pointer-events-none">{UNIVERSE_LABEL[u as Universe] ?? u}</span>;
}

export function KindTag({ kind }: { kind: string }) {
  const label = kind === 'hero' ? 'Hero' : kind === 'villain' ? 'Villain' : 'Antihero';
  return (
    <span
      className={`chip pointer-events-none ${kind === 'villain' ? 'bg-c2! text-on-c2!' : kind === 'hero' ? 'bg-c3! text-on-c3!' : ''}`}
    >
      {label}
    </span>
  );
}

export interface CardData {
  slug: string;
  name: string;
  universe: string;
  kind: string;
  summary: string;
  palette: { c1: string; c2: string; c3: string };
  motif: ClipParams['motif'];
  photo?: { file: string; alt: string; objectPosition?: string };
  heat?: number;
  year?: number;
}

/**
 * A roster card painted in the character's own colours (scoped CSS vars), so a grid of 100 reads
 * like a comic-shop wall. Photo when we have a credited Commons one; otherwise a still motif clip.
 */
export function CharacterCard({
  c,
  index = 0,
  href,
  className = '',
}: {
  c: CardData;
  index?: number;
  href?: string;
  className?: string;
}) {
  const style = scopeVars(c.palette) as React.CSSProperties;
  return (
    <m.li
      initial={{ y: 24 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: (index % 6) * 0.03 }}
      className={`list-none ${className}`}
    >
      <Link
        to={href ?? `/c/${c.slug}`}
        style={style}
        className="group panel relative block overflow-hidden transition-transform duration-200 hover:-translate-y-1 hover:-rotate-1 hover:shadow-ink-lg focus-visible:-translate-y-1"
      >
        <div
          className="relative aspect-[4/5] overflow-hidden border-line border-b-[3px]"
          style={{ background: c.palette.c2 }}
        >
          {c.photo ? (
            <img
              src={photoSrc(c.photo.file)}
              srcSet={photoSrcSet(c.photo.file)}
              sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
              alt=""
              loading="lazy"
              decoding="async"
              width={400}
              height={500}
              className="h-full w-full object-cover grayscale-[0.2] transition duration-300 group-hover:scale-105 group-hover:grayscale-0"
              style={{ objectPosition: c.photo.objectPosition ?? 'center' }}
            />
          ) : (
            <MotifClip
              params={{ ...c.palette, motif: c.motif, name: c.name, year: c.year }}
              kind="cover"
              aspect={4 / 5}
              className="h-full w-full"
              decorative
              hoverPlay
            />
          )}
          <span
            aria-hidden
            className="absolute inset-0 opacity-0 mix-blend-multiply transition-opacity group-hover:opacity-100"
            style={{
              background: `radial-gradient(${c.palette.c1} 1.2px, transparent 1.5px) 0 0/7px 7px`,
            }}
          />
        </div>
        <div className="space-y-1 p-3">
          <KindTag kind={c.kind} />
          <p className="h-display text-2xl" style={{ color: 'var(--card-fg)' }}>
            {c.name}
          </p>
          <p className="line-clamp-2 text-muted text-sm">{c.summary}</p>
        </div>
        <span
          aria-hidden
          className="absolute right-0 bottom-0 left-0 h-1.5"
          style={{
            background: `linear-gradient(90deg, ${c.palette.c1}, ${c.palette.c3}, ${c.palette.c2})`,
          }}
        />
      </Link>
    </m.li>
  );
}

export function SectionHead({
  kicker,
  title,
  action,
  level = 2,
  id,
}: {
  kicker: string;
  title: string;
  action?: React.ReactNode;
  id?: string;
  /** 1 when the head is the page title. */
  level?: 1 | 2;
}) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="kicker">{kicker}</p>
        <H id={id} className="h-display ink-text text-5xl text-c1-text sm:text-6xl">
          {title}
        </H>
      </div>
      {action}
    </div>
  );
}

/**
 * Scratch-to-reveal card. The secret text is in the DOM from the start (screen readers and
 * keyboard users get a "Reveal" button); the canvas foil is decoration on top.
 */
export function ScratchCard({
  label,
  children,
  foil = '#c0c0c8',
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  foil?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c || revealed) return;
    const r = c.getBoundingClientRect();
    c.width = r.width;
    c.height = r.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = foil;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff55';
    for (let i = 0; i < c.width; i += 6) ctx.fillRect(i, 0, 2, c.height);
    ctx.font = '28px Bangers, Impact, sans-serif';
    ctx.fillStyle = '#16120e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCRATCH ME!', c.width / 2, c.height / 2);
    let down = false;
    let scratched = 0;
    const scratch = (e: PointerEvent) => {
      if (!down) return;
      const b = c.getBoundingClientRect();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(e.clientX - b.left, e.clientY - b.top, 22, 0, Math.PI * 2);
      ctx.fill();
      if (++scratched > 28) setRevealed(true);
    };
    const start = (e: PointerEvent) => {
      down = true;
      c.setPointerCapture(e.pointerId);
      scratch(e);
    };
    const end = () => {
      down = false;
    };
    c.addEventListener('pointerdown', start);
    c.addEventListener('pointermove', scratch);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    return () => {
      c.removeEventListener('pointerdown', start);
      c.removeEventListener('pointermove', scratch);
      c.removeEventListener('pointerup', end);
      c.removeEventListener('pointercancel', end);
    };
  }, [foil, revealed]);
  return (
    <div className={`relative ${className}`}>
      <div aria-live="polite">{children}</div>
      {!revealed && (
        <>
          <canvas
            ref={ref}
            aria-hidden
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-[inherit]"
          />
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="btn btn-sm absolute right-2 bottom-2"
          >
            Reveal {label}
          </button>
        </>
      )}
    </div>
  );
}

/** Animated count-up for stat numbers; renders the final value on the server. */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const [n, setN] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 900);
        setN(Math.round(value * (1 - (1 - k) ** 3)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      setN(0);
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={ref} className={className}>
      {n}
    </span>
  );
}

export function PhotoCredit({
  photo,
}: {
  photo: { artist: string; license: string; licenseUrl?: string; sourcePage: string };
}) {
  return (
    <p className="text-muted text-xs">
      Photo:{' '}
      <a className="underline" href={photo.sourcePage} target="_blank" rel="noreferrer noopener">
        {photo.artist}
      </a>{' '}
      via Wikimedia Commons,{' '}
      {photo.licenseUrl ? (
        <a className="underline" href={photo.licenseUrl} target="_blank" rel="noreferrer noopener">
          {photo.license}
        </a>
      ) : (
        photo.license
      )}
    </p>
  );
}

export function Disclaimer() {
  return (
    <p className="panel bg-bg! p-3 text-muted text-xs">
      Unofficial fan page. Not affiliated with or endorsed by the character's owner. Facts are
      summarised in our own words with sources linked; all animations are original ComicMutant
      artwork.
    </p>
  );
}

export function VoteBar({ a, b, ca, cb }: { a: number; b: number; ca: string; cb: string }) {
  const total = a + b;
  const pa = total ? Math.round((a / total) * 100) : 50;
  return (
    <div>
      <div
        className="flex h-9 overflow-hidden rounded-md border-[3px] border-line"
        role="img"
        aria-label={`${pa}% to ${100 - pa}%`}
      >
        <m.div
          initial={{ width: '50%' }}
          whileInView={{ width: `${pa}%` }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
          style={{ background: ca }}
        />
        <div className="flex-1" style={{ background: cb }} />
      </div>
      <p className="mt-1 flex justify-between font-head text-sm">
        <span>{pa}%</span>
        <span>{total} votes</span>
        <span>{100 - pa}%</span>
      </p>
    </div>
  );
}
