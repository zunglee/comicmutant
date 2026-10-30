import { m, useScroll, useSpring } from 'motion/react';
import { useRef, useState } from 'react';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { data, Link } from 'react-router';
import { currentUser } from '~/.server/auth';
import { listTakes } from '~/.server/community';
import { gadgetsOf, getCharacter, toCard } from '~/.server/content';
import { getSql } from '~/.server/db';
import { packFor } from '~/.server/themes';
import { Atmosphere, useAtmosphere } from '~/components/atmosphere';
import {
  CharacterCard,
  Disclaimer,
  KindTag,
  MotifClip,
  PhotoCredit,
  UniverseTag,
} from '~/components/bits';
import { IconCheck, IconPin, IconVs } from '~/components/icons';
import { TakeComposer, TakeList } from '~/components/takes';
import { MilestoneStrip } from '~/components/timeline';
import { CLIP_LABEL } from '~/lib/clips/manifest';
import { photoSrc, photoSrcSet } from '~/lib/photos';
import type { Gossip, QuizItem, StoryBeat } from '~/lib/schema';
import { useTheme } from '~/lib/theme/context';
import type { Route } from './+types/character';

export async function loader({ params, request }: Route.LoaderArgs) {
  const c = getCharacter(params.slug);
  if (!c) throw data('No such character in this universe.', { status: 404 });
  // biome-ignore lint/style/noNonNullAssertion: every character resolves to a pack.
  const pack = packFor(c.slug)!;
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const link = (slugs: string[]) =>
    slugs
      .map(getCharacter)
      .filter((x) => x !== undefined)
      .map(toCard);
  return {
    c,
    pack,
    rivals: link(c.rivals),
    allies: link(c.allies),
    takes: await listTakes(sql, `c:${c.slug}`, user?.id ?? null),
    gadgets: gadgetsOf(c.slug).map((g) => ({ slug: g.slug, name: g.name, year: g.firstSeen.year })),
    signedIn: !!user,
  };
}

/** Reactions and reports update optimistically; don't refetch the whole page for them. */
export function shouldRevalidate({
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formAction === '/api/react' || formAction === '/api/report') return false;
  return defaultShouldRevalidate;
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${loaderData.c.name} — facts, gossip & story arcs · ComicMutant` },
        { name: 'description', content: loaderData.c.summary },
      ]
    : [{ title: 'Not found — ComicMutant' }];

export default function CharacterPage({ loaderData: d }: Route.ComponentProps) {
  const { c, pack } = d;
  const params = {
    ...c.theme.palette,
    motif: c.theme.motif,
    name: c.name,
    year: c.firstAppearance.year,
  };
  // The page's weather is this character's, whatever theme the site wears.
  const weather = {
    motif: c.theme.motif,
    c1: c.theme.palette.c1,
    c3: c.theme.palette.c3,
    dark: pack.mood === 'dark',
  };
  useAtmosphere(weather);
  // The whole page wears the character's theme, whatever the site theme is.
  return (
    <div
      style={{ ...(pack.vars as React.CSSProperties), background: 'var(--bg)', color: 'var(--fg)' }}
      className="relative isolate"
      data-mood={pack.mood}
    >
      <Atmosphere weather={weather} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(var(--halftone) 1.4px, transparent 1.6px)',
          backgroundSize: '14px 14px',
        }}
      />
      <div className="relative z-[1]">
        <Splash d={d} params={params} />
      </div>
      <div className="relative z-[1] mx-auto max-w-7xl space-y-24 px-4 pb-20">
        <PowerFile c={c} />
        <Storyline beats={c.storyline} params={params} />
        {c.timeline && (
          <section aria-labelledby="timeline-h">
            <p className="kicker">Real-world timeline</p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="timeline-h" className="h-display ink-text text-5xl text-c1-text">
                {c.name} through the years
              </h2>
              <Link
                to={`/timeline?d=${Math.floor(c.firstAppearance.year / 10) * 10}`}
                className="btn"
              >
                Multiverse timeline <IconVs className="size-4" />
              </Link>
            </div>
            <MilestoneStrip items={c.timeline} />
          </section>
        )}
        {d.gadgets.length > 0 && (
          <section aria-labelledby="gear-h">
            <p className="kicker">Gadget Lab</p>
            <h2 id="gear-h" className="h-display ink-text mb-4 text-5xl text-c1-text">
              Take the gear apart
            </h2>
            <ul className="flex flex-wrap gap-3">
              {d.gadgets.map((g) => (
                <li key={g.slug}>
                  <Link to={`/gadgets/${g.slug}`} className="btn btn-c3">
                    {g.name} <span className="text-xs">({g.year})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <GossipWall items={c.gossip} name={c.name} />
        <MiniQuiz items={c.quiz} name={c.name} />
        <ClipWall params={params} clips={pack.clips} />
        <Relations rivals={d.rivals} allies={d.allies} />
        <section aria-labelledby="takes-h" className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <p className="kicker">Hot takes</p>
            <h2 id="takes-h" className="h-display ink-text text-5xl text-c1-text">
              Say it loud
            </h2>
            <p>
              One-liners only. React with a sound effect. Three reports and a take goes to the mods.
            </p>
            <TakeComposer
              target={`c:${c.slug}`}
              signedIn={d.signedIn}
              placeholder={`Your hottest ${c.name} take…`}
            />
          </div>
          <TakeList takes={d.takes} signedIn={d.signedIn} target={`c:${c.slug}`} />
        </section>
        <footer className="space-y-3">
          <p className="text-sm">
            Sources:{' '}
            {Object.entries(c.sources).map(([k, v], i) => (
              <span key={k}>
                {i > 0 && ' · '}
                <a href={v} target="_blank" rel="noreferrer noopener" className="underline">
                  {k}
                </a>
              </span>
            ))}
          </p>
          {c.photo && <PhotoCredit photo={c.photo} />}
          <Disclaimer />
        </footer>
      </div>
    </div>
  );
}

type D = Route.ComponentProps['loaderData'];
type Params = {
  c1: string;
  c2: string;
  c3: string;
  motif: D['c']['theme']['motif'];
  name: string;
  year: number;
};

function Splash({ d, params }: { d: D; params: Params }) {
  const { c, pack } = d;
  const { equip, pin, top5, current } = useTheme();
  const pinned = top5.some((p) => p.slug === c.slug);
  const wearing = current.slug === c.slug;
  const letters = c.name.toUpperCase().split('');
  return (
    <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-20 lg:grid-cols-[1.2fr_1fr]">
      <div className="relative z-10 space-y-5">
        <div className="flex flex-wrap gap-2">
          <UniverseTag u={c.universe} />
          <KindTag kind={c.kind} />
          <span className="chip pointer-events-none">Since {c.firstAppearance.year}</span>
        </div>
        <h1 aria-label={c.name} className="h-display text-[clamp(3rem,9vw,7rem)] leading-[0.85]">
          {letters.map((ch, i) => (
            <m.span
              // biome-ignore lint/suspicious/noArrayIndexKey: letters of a fixed name.
              key={i}
              aria-hidden
              className={`ink-text inline-block ${i % 3 === 1 ? 'text-c3-text' : 'text-c1-text'}`}
              initial={{ y: -60, rotate: (i % 2 ? 1 : -1) * 20 }}
              animate={{ y: 0, rotate: (i % 2 ? 1 : -1) * 3 }}
              transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.03 * i }}
            >
              {ch === ' ' ? ' ' : ch}
            </m.span>
          ))}
        </h1>
        {c.realName && (
          <p className="h-head text-xl">
            <span className="text-muted">aka</span> {c.realName}
          </p>
        )}
        <p className="bubble max-w-xl text-lg">{c.summary}</p>
        <p className="h-head text-c3-text text-lg">“{pack.tagline}”</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-c1"
            aria-pressed={wearing}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              equip(pack, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
          >
            {wearing ? <IconCheck /> : null}
            {wearing ? 'Theme on' : 'Wear this theme'}
          </button>
          <button type="button" className="btn" onClick={() => pin(pack)} disabled={pinned}>
            <IconPin /> {pinned ? 'In your top 5' : 'Pin to top 5'}
          </button>
          <Link to={`/versus?a=${c.slug}`} className="btn btn-c3">
            <IconVs /> Start a Versus
          </Link>
        </div>
      </div>
      <m.div
        initial={{ rotate: -8, scale: 0.9 }}
        animate={{ rotate: -2, scale: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 12 }}
        className="relative mx-auto w-full max-w-md"
      >
        <div className="panel overflow-hidden p-0 shadow-ink-lg">
          {c.photo ? (
            <img
              src={photoSrc(c.photo.file)}
              srcSet={photoSrcSet(c.photo.file)}
              sizes="(min-width: 1024px) 28rem, 90vw"
              alt={c.photo.alt}
              width={480}
              height={600}
              fetchPriority="high"
              className="aspect-[4/5] w-full object-cover"
              style={{ objectPosition: c.photo.objectPosition ?? 'center' }}
            />
          ) : (
            <MotifClip params={params} kind="cover" aspect={4 / 5} save />
          )}
        </div>
        <div className="panel absolute -right-3 -bottom-6 w-32 rotate-6 overflow-hidden p-0 sm:-right-8 sm:w-40">
          <MotifClip params={params} kind="impact" aspect={1} />
        </div>
      </m.div>
    </section>
  );
}

function PowerFile({ c }: { c: D['c'] }) {
  return (
    <section aria-labelledby="file-h" className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="panel space-y-4 p-6">
        <p className="kicker">Case file</p>
        <h2 id="file-h" className="h-display text-5xl">
          Origin
        </h2>
        <p className="leading-relaxed">{c.origin}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="kicker text-card-fg!">First seen</dt>
            <dd>
              {c.firstAppearance.title}
              {c.firstAppearance.issue ? ` #${c.firstAppearance.issue}` : ''} (
              {c.firstAppearance.year})
            </dd>
          </div>
          <div>
            <dt className="kicker text-card-fg!">Created by</dt>
            <dd>{c.creators.join(', ')}</dd>
          </div>
          <div>
            <dt className="kicker text-card-fg!">Publisher</dt>
            <dd>{c.publisher}</dd>
          </div>
          {c.affiliations.length > 0 && (
            <div>
              <dt className="kicker text-card-fg!">Crews</dt>
              <dd>{c.affiliations.slice(0, 5).join(', ')}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="panel-c1 halftone space-y-4 p-6">
        <p className="font-head text-xs uppercase tracking-[0.16em]">Power readout</p>
        <h2 className="h-display text-5xl">What they can do</h2>
        <ul className="flex flex-wrap gap-2">
          {c.powers.map((p, i) => (
            <m.li
              key={p}
              initial={{ scale: 0.6, rotate: -6 }}
              whileInView={{ scale: 1, rotate: i % 2 ? 1.5 : -1.5 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 420, damping: 15, delay: i * 0.04 }}
              className="rounded-md border-[3px] border-line bg-white px-3 py-1.5 font-semibold text-[#16120e] text-sm shadow-ink-sm"
            >
              {p}
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Story arcs as a comic strip: each beat gets a different panel shape, joined by a scroll-drawn spine. */
function Storyline({ beats, params }: { beats: StoryBeat[]; params: Params }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 60%'] });
  const spine = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const shapes = ['splash', 'tilt-l', 'inset', 'tilt-r', 'wide'];
  const clips = ['speedlines', 'storm', 'portal', 'charge', 'spotlight', 'glitch', 'skyline-run'];
  return (
    <section aria-labelledby="story-h">
      <p className="kicker">The storyline</p>
      <h2 id="story-h" className="h-display ink-text mb-10 text-5xl text-c1-text sm:text-6xl">
        Previously on…
      </h2>
      <ol ref={ref} className="relative space-y-12 md:space-y-16">
        <m.span
          aria-hidden
          style={{ scaleY: spine }}
          className="absolute top-0 bottom-0 left-5 w-1.5 origin-top rounded bg-c3 md:left-1/2 md:-translate-x-1/2"
        />
        {beats.map((b, i) => {
          const shape = shapes[i % shapes.length];
          const right = i % 2 === 1;
          return (
            <m.li
              key={`${b.era}-${b.title}`}
              initial={{ x: right ? 60 : -60, rotate: right ? 3 : -3 }}
              whileInView={{
                x: 0,
                rotate: shape === 'tilt-l' ? -1.5 : shape === 'tilt-r' ? 1.5 : 0,
              }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ type: 'spring', stiffness: 170, damping: 18 }}
              className={`relative pl-14 md:w-[calc(50%-2.5rem)] md:pl-0 ${right ? 'md:ml-auto' : ''}`}
            >
              <span
                aria-hidden
                className={`burst absolute top-4 left-1 grid size-10 place-items-center bg-c3 font-display text-on-c3 text-lg md:top-6 ${
                  right ? 'md:-left-[3.75rem]' : 'md:right-[-3.75rem] md:left-auto'
                }`}
              >
                {i + 1}
              </span>
              <article className={`panel overflow-hidden ${shape === 'wide' ? 'md:-mr-24' : ''}`}>
                {(shape === 'splash' || shape === 'wide') && (
                  <MotifClip
                    params={params}
                    kind={clips[i % clips.length] ?? 'panels'}
                    aspect={shape === 'wide' ? 2.6 : 2}
                  />
                )}
                <div
                  className={`space-y-2 p-5 ${shape === 'inset' ? 'grid grid-cols-[1fr_6rem] gap-4 space-y-0' : ''}`}
                >
                  <div className="space-y-2">
                    <p className="w-fit -rotate-1 border-2 border-line bg-c3 px-2 py-0.5 font-head text-on-c3 text-xs uppercase">
                      {b.era} · {b.years}
                    </p>
                    <h3 className="h-display text-3xl">{b.title}</h3>
                    <p className="leading-relaxed">{b.beat}</p>
                  </div>
                  {shape === 'inset' && (
                    <div className="aspect-square self-start overflow-hidden rounded-full border-[3px] border-line">
                      <MotifClip params={params} kind="orbit" aspect={1} />
                    </div>
                  )}
                </div>
              </article>
            </m.li>
          );
        })}
      </ol>
    </section>
  );
}

const STAMP: Record<Gossip['type'], string> = {
  fact: 'TRUE STORY',
  gossip: 'OFF THE RECORD',
  myth: 'MYTH?',
};

function GossipWall({ items, name }: { items: Gossip[]; name: string }) {
  return (
    <section aria-labelledby="gossip-h">
      <p className="kicker">Hidden gossip &amp; facts</p>
      <h2 id="gossip-h" className="h-display ink-text mb-8 text-5xl text-c1-text sm:text-6xl">
        The {name} files
      </h2>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g, i) => (
          <GossipCard key={g.text} g={g} i={i} />
        ))}
      </ul>
    </section>
  );
}

function GossipCard({ g, i }: { g: Gossip; i: number }) {
  const [open, setOpen] = useState(g.type !== 'myth');
  return (
    <m.li
      initial={{ y: 30, rotate: 0 }}
      whileInView={{ y: 0, rotate: [-1.5, 1, -0.5, 1.5][i % 4] }}
      whileHover={{ rotate: 0, scale: 1.02 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="panel relative space-y-3 p-5"
    >
      <span
        className={`absolute -top-3 right-3 rotate-6 border-[3px] px-2 py-0.5 font-display text-lg tracking-wide ${
          g.type === 'myth'
            ? 'border-[#b00020] bg-white text-[#b00020]'
            : 'border-line bg-c3 text-on-c3'
        }`}
      >
        {STAMP[g.type]}
      </span>
      <p className="font-head text-xs">
        <span className="sr-only">Spice level: </span>
        {['MILD', 'SPICY', 'SCORCHING'][g.spice - 1]}
      </p>
      <p className="text-lg leading-snug">{g.text}</p>
      {g.type === 'myth' && g.truth && (
        <div>
          {open ? (
            <m.p
              initial={{ scale: 0.8, rotate: -4 }}
              animate={{ scale: 1, rotate: -1 }}
              className="bubble text-sm"
            >
              <strong className="font-display text-[#b00020] text-xl">BUSTED! </strong>
              {g.truth}
            </m.p>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-c1"
              onClick={() => setOpen(true)}
              aria-expanded={open}
            >
              True or cap? Reveal
            </button>
          )}
        </div>
      )}
    </m.li>
  );
}

function MiniQuiz({ items, name }: { items: QuizItem[]; name: string }) {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = items[i];
  const done = i >= items.length;
  return (
    <section
      aria-labelledby="quiz-h"
      className="panel halftone mx-auto max-w-3xl space-y-5 p-6 sm:p-8"
    >
      <p className="kicker">Pop quiz</p>
      <h2 id="quiz-h" className="h-display text-5xl">
        How well do you know {name}?
      </h2>
      <div aria-live="polite">
        {done || !q ? (
          <div className="space-y-4">
            <p className="h-display text-6xl text-c1-text-card">
              {score}/{items.length}
            </p>
            <p>
              {score === items.length
                ? 'Flawless. Certified trivia oracle.'
                : 'Not bad — the Arena quiz has more.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setI(0);
                  setPick(null);
                  setScore(0);
                }}
              >
                Again
              </button>
              <Link to="/arena" className="btn btn-c1">
                Quiz Duel in the Arena
              </Link>
            </div>
          </div>
        ) : (
          <fieldset className="space-y-3">
            <legend className="h-head mb-3 text-xl">
              Q{i + 1}. {q.q}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((o, k) => {
                const state =
                  pick === null
                    ? ''
                    : k === q.answer
                      ? 'bg-[#2fd36b]! text-[#0d0b10]!'
                      : k === pick
                        ? 'bg-[#ff4d4d]! text-[#0d0b10]!'
                        : 'opacity-60';
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={pick !== null}
                    onClick={() => {
                      setPick(k);
                      if (k === q.answer) setScore((s) => s + 1);
                    }}
                    className={`btn justify-start text-left normal-case ${state}`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {pick !== null && (
              <div className="space-y-3">
                <p className="bubble text-sm">
                  <strong>{pick === q.answer ? 'Correct! ' : 'Nope. '}</strong>
                  {q.why}
                </p>
                <button
                  type="button"
                  className="btn btn-c1"
                  onClick={() => {
                    setI(i + 1);
                    setPick(null);
                  }}
                >
                  {i + 1 < items.length ? 'Next' : 'Score'}
                </button>
              </div>
            )}
          </fieldset>
        )}
      </div>
    </section>
  );
}

function ClipWall({ params, clips }: { params: Params; clips: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? clips : clips.slice(0, 8);
  return (
    <section aria-labelledby="clips-h">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{clips.length} animated clips</p>
          <h2 id="clips-h" className="h-display ink-text text-5xl text-c1-text sm:text-6xl">
            The GIF wall
          </h2>
        </div>
        <p className="max-w-sm text-sm text-muted">
          Original animations in {params.name}'s colours. Hover a clip and hit Save to download it.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {shown.map((id, i) => (
          <m.li
            key={id}
            initial={{ scale: 0.85 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: (i % 4) * 0.04 }}
            className="panel overflow-hidden p-0"
          >
            <MotifClip params={params} kind={id} aspect={1} save />
            <p className="border-line border-t-[3px] px-3 py-1.5 font-head text-xs uppercase">
              {CLIP_LABEL[id]}
            </p>
          </m.li>
        ))}
      </ul>
      {!all && clips.length > 8 && (
        <div className="mt-6 text-center">
          <button type="button" className="btn btn-c1" onClick={() => setAll(true)}>
            Show all {clips.length} clips
          </button>
        </div>
      )}
    </section>
  );
}

function Relations({ rivals, allies }: { rivals: D['rivals']; allies: D['allies'] }) {
  if (!rivals.length && !allies.length) return null;
  return (
    <section className="grid gap-10 lg:grid-cols-2">
      {[
        ['Arch-rivals', rivals],
        ['Ride or die', allies],
      ].map(([title, list]) =>
        (list as D['rivals']).length ? (
          <div key={title as string}>
            <h2 className="h-display ink-text mb-5 text-4xl text-c1-text">{title as string}</h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(list as D['rivals']).slice(0, 6).map((c, i) => (
                <CharacterCard key={c.slug} c={c} index={i} />
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}
