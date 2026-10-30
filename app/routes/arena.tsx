/**
 * /arena — the games hub. First: Quick play — today's hero-vs-villain matchup against the CPU, one
 * tap per game. Below: the full picker (game, matchup mode, two ComicMutant originals, opponent,
 * difficulty), preselected with the same CPU fight; FIGHT! plays a VS splash and opens
 * /arena/<game>?p1&p2&vs&d.
 * Only originals (`Fighter`) appear here — never real, published characters.
 */
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { allFighters } from '~/.server/content';
import { KindTag } from '~/components/bits';
import { SpriteClip } from '~/components/sprite';
import { loadRecords, type Records } from '~/game/records';
import type { PoseId } from '~/game/sprite/poses';
import { type Difficulty, GAME_IDS, GAME_TITLES, type GameId, type Versus } from '~/game/types';
import { useAnimate } from '~/lib/fx';
import type { Fighter } from '~/lib/schema';
import { scopeVars } from '~/lib/theme/compute';
import type { Route } from './+types/arena';

export const meta: Route.MetaFunction = () => [
  { title: 'The Arena — ComicMutant mini-games' },
  {
    name: 'description',
    content:
      'Brawl, smash, score and out-quiz: four free browser mini-games starring the ComicMutant originals. Play the CPU or a friend on one keyboard.',
  },
];

/** Today's CPU matchup: a hero and a villain, rotating daily (same for every visitor that day). */
function dailyPair(fighters: readonly Fighter[]) {
  const day = Math.floor(Date.now() / 86_400_000);
  const heroes = fighters.filter((f) => f.kind !== 'villain');
  const villains = fighters.filter((f) => f.kind !== 'hero');
  const p1 = heroes[day % heroes.length];
  const p2 = villains.filter((f) => f.slug !== p1?.slug)[
    (day * 7) % Math.max(1, villains.length - 1)
  ];
  return p1 && p2 ? { p1: p1.slug, p2: p2.slug } : null;
}

export function loader() {
  const fighters = allFighters();
  return { fighters, quick: dailyPair(fighters) };
}

const GAME_INFO: Record<GameId, { blurb: string; pose: PoseId; tag: string }> = {
  fight: {
    blurb: 'Side-view brawler. Best of three, combos, specials, K.O.s.',
    pose: 'punch',
    tag: 'Brawler',
  },
  badminton: {
    blurb: 'Clears, drops and jump smashes over the net. First to 11.',
    pose: 'serve',
    tag: 'Sport',
  },
  football: {
    blurb: 'Big-head 1v1 football. Headers, chips and power shots. 90 seconds.',
    pose: 'kick-ball',
    tag: 'Sport',
  },
  quiz: {
    blurb: 'Comic trivia duel. Right answers land the hits. 10 questions.',
    pose: 'special',
    tag: 'Trivia',
  },
};

type Mode = 'hvv' | 'hvh' | 'vvv' | 'chaos';
const MODES: { id: Mode; label: string }[] = [
  { id: 'hvv', label: 'Hero vs Villain' },
  { id: 'hvh', label: 'Hero vs Hero' },
  { id: 'vvv', label: 'Villain vs Villain' },
  { id: 'chaos', label: 'Random chaos' },
];

const heroish = (f: Fighter) => f.kind !== 'villain';
const villainish = (f: Fighter) => f.kind !== 'hero';
function pool(all: readonly Fighter[], mode: Mode, slot: 'p1' | 'p2') {
  if (mode === 'hvv') return all.filter(slot === 'p1' ? heroish : villainish);
  if (mode === 'hvh') return all.filter(heroish);
  if (mode === 'vvv') return all.filter(villainish);
  return all;
}

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

export default function Arena({ loaderData: d }: Route.ComponentProps) {
  const fighters = d.fighters;
  const animate = useAnimate();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Defaults to a ready CPU fight (today's pair) unless the URL asks for something else.
  const initGame = GAME_IDS.find((g) => g === params.get('game')) ?? 'fight';
  const [game, setGame] = useState<GameId | null>(initGame);
  const [mode, setMode] = useState<Mode>('hvv');
  const [p1, setP1] = useState<string | null>(params.get('p1') ?? d.quick?.p1 ?? null);
  const [p2, setP2] = useState<string | null>(params.get('p2') ?? d.quick?.p2 ?? null);
  const [slot, setSlot] = useState<'p1' | 'p2'>(params.get('p1') ? 'p2' : 'p1');
  const [vs, setVs] = useState<Versus>('cpu');
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [splash, setSplash] = useState(false);
  const [records, setRecords] = useState<Records>({});
  useEffect(() => setRecords(loadRecords()), []);

  const bySlug = useMemo(() => new Map(fighters.map((f) => [f.slug, f])), [fighters]);
  const f1 = p1 ? bySlug.get(p1) : undefined;
  const f2 = p2 ? bySlug.get(p2) : undefined;
  const list = pool(fighters, mode, slot);
  const ready = !!(game && f1 && f2);

  const pick = (f: Fighter) => {
    if (slot === 'p1') {
      setP1(f.slug);
      if (!p2 || p2 === f.slug) setSlot('p2');
    } else {
      setP2(f.slug);
      if (!p1) setSlot('p1');
    }
  };

  const shuffle = () => {
    const a = pool(fighters, mode, 'p1');
    const x = a[Math.floor(Math.random() * a.length)];
    const b = pool(fighters, mode, 'p2').filter((f) => f.slug !== x?.slug);
    const y = b[Math.floor(Math.random() * b.length)];
    if (x) setP1(x.slug);
    if (y) setP2(y.slug);
  };

  const changeMode = (mo: Mode) => {
    setMode(mo);
    if (mo === 'chaos') {
      const a = fighters[Math.floor(Math.random() * fighters.length)];
      const rest = fighters.filter((f) => f.slug !== a?.slug);
      const b = rest[Math.floor(Math.random() * rest.length)];
      if (a) setP1(a.slug);
      if (b) setP2(b.slug);
      return;
    }
    if (f1 && !pool(fighters, mo, 'p1').includes(f1)) setP1(null);
    if (f2 && !pool(fighters, mo, 'p2').includes(f2)) setP2(null);
    setSlot('p1');
  };

  const href = ready ? `/arena/${game}?p1=${f1.slug}&p2=${f2.slug}&vs=${vs}&d=${diff}` : '';
  const fight = () => {
    if (!ready) return;
    if (!animate) return navigate(href);
    setSplash(true);
    setTimeout(() => navigate(href), 1900);
  };

  if (fighters.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="h-display mb-4 text-5xl">The Arena</h1>
        <p>The fighters are still warming up. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <p className="kicker">Mini-games · CM Originals only</p>
        <h1 className="h-display ink-text text-5xl text-c3 sm:text-7xl">The Arena</h1>
        <p className="mt-2 max-w-2xl">
          Four games, {fighters.length} originals, one keyboard (or a touch screen). Pick your
          poison.
        </p>
      </header>

      {d.quick && <QuickPlay fighters={bySlug} pair={d.quick} />}

      <RecordStrip records={records} />

      {/* 1 · game */}
      <Step n={1} title="Pick a game">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GAME_IDS.map((g, i) => {
            const f = fighters[(i * 7) % fighters.length] as Fighter;
            const on = game === g;
            return (
              <m.button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => setGame(g)}
                style={scopeVars(f.theme.palette) as React.CSSProperties}
                className={`panel group overflow-hidden text-left ${on ? 'outline-4 outline-c3 outline-offset-2' : ''}`}
                whileHover={animate ? { y: -6, rotate: i % 2 ? 1.2 : -1.2 } : undefined}
                whileTap={animate ? { scale: 0.97 } : undefined}
                initial={animate ? { y: 30, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 22,
                  delay: animate ? i * 0.06 : 0,
                }}
              >
                <div className="border-line border-b-[3px]">
                  <SpriteClip fighter={f} pose={GAME_INFO[g].pose} aspect={4 / 3} decorative />
                </div>
                <div className="space-y-1 p-3">
                  <span className="chip">{GAME_INFO[g].tag}</span>
                  <p className="h-display text-3xl">{GAME_TITLES[g]}</p>
                  <p className="text-muted text-sm">{GAME_INFO[g].blurb}</p>
                </div>
              </m.button>
            );
          })}
        </div>
      </Step>

      {/* 2 · matchup */}
      <Step n={2} title="Matchup">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Matchup mode</legend>
          {MODES.map((mo) => (
            <button
              key={mo.id}
              type="button"
              className="chip min-h-[44px] text-sm"
              aria-pressed={mode === mo.id}
              onClick={() => changeMode(mo.id)}
            >
              {mo.label}
            </button>
          ))}
          <button type="button" className="btn btn-sm min-h-[44px]" onClick={shuffle}>
            Shuffle
          </button>
        </fieldset>
      </Step>

      {/* 3 · fighters */}
      <Step n={3} title="Fighters">
        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Slot
            label="Player 1"
            f={f1}
            active={slot === 'p1'}
            onClick={() => setSlot('p1')}
            pose="block"
            animate={animate}
          />
          <span className="h-display burst bg-c1 px-5 py-6 text-3xl text-on-c1" aria-hidden>
            VS
          </span>
          <Slot
            label={vs === 'cpu' ? 'CPU' : 'Player 2'}
            f={f2}
            active={slot === 'p2'}
            onClick={() => setSlot('p2')}
            pose="special"
            animate={animate}
            mirror
          />
        </div>
        <p className="mb-2 text-sm" aria-live="polite">
          Choosing{' '}
          <strong>{slot === 'p1' ? 'Player 1' : vs === 'cpu' ? 'the CPU' : 'Player 2'}</strong> ·{' '}
          {list.length} available
        </p>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {list.map((f) => {
            const chosen =
              f.slug === p1 ? 'P1' : f.slug === p2 ? (vs === 'cpu' ? 'CPU' : 'P2') : null;
            return (
              <li key={f.slug}>
                <button
                  type="button"
                  onClick={() => pick(f)}
                  aria-pressed={!!chosen}
                  style={scopeVars(f.theme.palette) as React.CSSProperties}
                  className={`panel relative block w-full overflow-hidden text-left transition-transform hover:-translate-y-1 ${chosen ? 'outline-4 outline-c3 outline-offset-2' : ''}`}
                >
                  <SpriteClip fighter={f} pose="idle" decorative hoverPlay />
                  <span className="block truncate px-2 py-1 font-head text-xs">
                    {f.alias}
                    <span className="sr-only">
                      , {f.kind}, {f.archetype}
                    </span>
                  </span>
                  {chosen && <span className="chip absolute top-1 left-1">{chosen}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Step>

      {/* 4 · opponent */}
      <Step n={4} title="Opponent">
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex gap-2">
            <legend className="sr-only">Opponent</legend>
            <button
              type="button"
              className="chip min-h-[44px] text-sm"
              aria-pressed={vs === 'cpu'}
              onClick={() => setVs('cpu')}
            >
              CPU
            </button>
            <button
              type="button"
              className="chip min-h-[44px] text-sm"
              aria-pressed={vs === 'local'}
              onClick={() => setVs('local')}
            >
              Local friend (one keyboard)
            </button>
          </fieldset>
          {vs === 'cpu' && (
            <fieldset className="flex gap-2">
              <legend className="sr-only">Difficulty</legend>
              {DIFFS.map((x) => (
                <button
                  key={x}
                  type="button"
                  className="chip min-h-[44px] text-sm capitalize"
                  aria-pressed={diff === x}
                  onClick={() => setDiff(x)}
                >
                  {x}
                </button>
              ))}
            </fieldset>
          )}
        </div>
      </Step>

      <div className="sticky bottom-20 z-20 mt-8 flex justify-center lg:static">
        <m.button
          type="button"
          disabled={!ready}
          onClick={fight}
          className="btn btn-c1 h-display px-10 text-3xl"
          whileHover={ready && animate ? { scale: 1.06, rotate: -2 } : undefined}
          whileTap={ready && animate ? { scale: 0.94 } : undefined}
        >
          {ready ? 'FIGHT!' : !game ? 'Pick a game' : 'Pick two fighters'}
        </m.button>
      </div>

      <AnimatePresence>
        {splash && f1 && f2 && game && <VsSplash a={f1} b={f2} game={game} />}
      </AnimatePresence>
    </div>
  );
}

/** Quick play: today's pair vs the CPU (normal), one button per game, straight into the match. */
function QuickPlay({
  fighters,
  pair,
}: {
  fighters: Map<string, Fighter>;
  pair: { p1: string; p2: string };
}) {
  const a = fighters.get(pair.p1);
  const b = fighters.get(pair.p2);
  if (!a || !b) return null;
  const href = (g: GameId) => `/arena/${g}?p1=${a.slug}&p2=${b.slug}&vs=cpu&d=normal`;
  return (
    <section aria-labelledby="quick-h" className="panel halftone mb-10 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="quick-h" className="h-display ink-text text-4xl text-c3">
          Quick play vs CPU
        </h2>
        <p className="kicker">Today's matchup · normal difficulty</p>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {[a, b].map((f, i) => (
          <div
            key={f.slug}
            className={`overflow-hidden rounded border-[3px] border-line ${i ? 'order-3' : ''}`}
            style={scopeVars(f.theme.palette) as React.CSSProperties}
          >
            <SpriteClip fighter={f} pose={i ? 'special' : 'block'} aspect={16 / 9} decorative />
            <p className="bg-card px-2 py-1 font-head text-sm">
              {i ? 'CPU · ' : 'You · '}
              {f.alias}
            </p>
          </div>
        ))}
        <span className="h-display burst order-2 bg-c1 px-4 py-5 text-2xl text-on-c1" aria-hidden>
          VS
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {GAME_IDS.map((g, i) => (
          <Link
            key={g}
            to={href(g)}
            className={`btn ${i === 0 ? 'btn-c1 h-display text-2xl' : ''}`}
            aria-label={`Play ${GAME_TITLES[g]}: ${a.alias} versus ${b.alias} (CPU)`}
          >
            {i === 0 ? `PLAY ${GAME_TITLES[g].toUpperCase()}` : GAME_TITLES[g]}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="h-head mb-3 flex items-center gap-3 text-xl">
        <span className="burst bg-c3 px-3 py-2 font-display text-on-c3 text-lg" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Slot({
  label,
  f,
  active,
  onClick,
  pose,
  animate,
  mirror,
}: {
  label: string;
  f: Fighter | undefined;
  active: boolean;
  onClick: () => void;
  pose: PoseId;
  animate: boolean;
  mirror?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={f ? (scopeVars(f.theme.palette) as React.CSSProperties) : undefined}
      className={`panel flex items-center gap-3 overflow-hidden p-2 text-left ${active ? 'outline-4 outline-c3 outline-offset-2' : ''} ${mirror ? 'flex-row-reverse text-right' : ''}`}
    >
      <div
        className={`w-20 shrink-0 overflow-hidden rounded border-2 border-line sm:w-28 ${mirror ? '-scale-x-100' : ''}`}
      >
        {f ? (
          <SpriteClip key={f.slug} fighter={f} pose={pose} decorative />
        ) : (
          <div className="halftone aspect-square bg-bg" />
        )}
      </div>
      <AnimatePresence mode="wait">
        <m.div
          key={f?.slug ?? 'none'}
          initial={animate ? { opacity: 0, x: mirror ? 20 : -20 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={animate ? { opacity: 0 } : undefined}
          className="min-w-0"
        >
          <p className="kicker">{label}</p>
          <p className="h-display truncate text-2xl sm:text-3xl">{f ? f.alias : 'Choose…'}</p>
          {f && (
            <div
              className={`mt-1 flex flex-wrap items-center gap-2 ${mirror ? 'justify-end' : ''}`}
            >
              <KindTag kind={f.kind} />
              <span className="text-muted text-xs">{f.special.name}</span>
            </div>
          )}
        </m.div>
      </AnimatePresence>
    </button>
  );
}

function VsSplash({ a, b, game }: { a: Fighter; b: Fighter; game: GameId }) {
  return (
    <m.div
      className="fixed inset-0 z-[80] grid grid-cols-2 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label={`${a.alias} versus ${b.alias}`}
    >
      {[a, b].map((f, i) => (
        <m.div
          key={f.slug}
          style={scopeVars(f.theme.palette) as React.CSSProperties}
          className="speed-bg relative flex flex-col items-center justify-center gap-3 p-4"
          initial={{ x: i ? '100%' : '-100%' }}
          animate={{ x: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 24, delay: i * 0.12 }}
        >
          <div
            className={`w-48 overflow-hidden rounded border-4 border-line shadow-ink-lg sm:w-80 ${i ? '-scale-x-100' : ''}`}
          >
            <SpriteClip fighter={f} pose={i ? 'special' : 'punch'} autoPlay />
          </div>
          <m.p
            className="h-display border-4 border-line bg-[var(--c1)] px-4 text-4xl text-[var(--on-c1)] shadow-ink sm:text-6xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.45 + i * 0.1 }}
          >
            {f.alias}
          </m.p>
          <m.p
            className="bubble max-w-xs text-sm"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8 + i * 0.15, type: 'spring' }}
          >
            “{f.catchphrase}”
          </m.p>
        </m.div>
      ))}
      <m.div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        initial={{ scale: 3, rotate: -30, opacity: 0 }}
        animate={{ scale: 1, rotate: -8, opacity: 1 }}
        transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 14 }}
      >
        <span className="burst h-display bg-c3 px-12 py-14 text-7xl text-on-c3 sm:text-9xl">
          VS
        </span>
        <span className="h-display ink-text mt-2 text-3xl text-fg">{GAME_TITLES[game]}</span>
      </m.div>
    </m.div>
  );
}

function RecordStrip({ records }: { records: Records }) {
  const rows = GAME_IDS.map((g) => [g, records[g]] as const).filter(([, r]) => r && r.played > 0);
  if (!rows.length) return null;
  return (
    <section
      aria-label="Your record"
      className="panel halftone mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
    >
      <p className="kicker">Your record (this device)</p>
      {rows.map(([g, r]) =>
        r ? (
          <p key={g} className="text-sm">
            <strong className="font-head">{GAME_TITLES[g]}</strong> {r.wins}W {r.losses}L {r.draws}D
            {r.streak > 1 ? ` · ${r.streak} win streak` : ''} · best {r.bestScore}
          </p>
        ) : null,
      )}
      <Link to="/originals" className="ml-auto text-sm underline">
        Meet the cast
      </Link>
    </section>
  );
}
