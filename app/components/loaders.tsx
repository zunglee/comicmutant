/**
 * Full-screen Motion scenes in the equipped theme's colours (byte-man's loaders, comic style):
 *  - intro: first page of a browser session ("COMIC MUTANT" panel slam; the server renders a
 *    curtain so nothing flashes before hydration);
 *  - transit: a push navigation to another page — a short themed sweep whose style follows the
 *    theme's motif. It lifts as soon as the page has loaded (after a 0.4s minimum, so it reads as a
 *    beat, not a flicker), lets clicks through to the page, and never plays on Back/Forward.
 * Esc or Skip ends any scene (a click also ends the intro). Lite FX and reduced motion skip them.
 */
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { SFX } from '~/lib/clips/motifs';
import { useAnimate } from '~/lib/fx';
import type { Motif } from '~/lib/taxonomy';
import { useTheme } from '~/lib/theme/context';

const INTRO_S = 1.8;
const TRANSIT_S = 0.5;
const TRANSIT_MIN_MS = 400;
const TRANSIT_MAX_MS = 900;

type SceneKind = 'slam' | 'iris' | 'stripes';
const SCENE_FOR: Record<Motif, SceneKind> = {
  strength: 'slam',
  bolt: 'slam',
  claw: 'slam',
  chaos: 'slam',
  flame: 'slam',
  cosmic: 'iris',
  magic: 'iris',
  mind: 'iris',
  water: 'iris',
  ice: 'iris',
  shadow: 'iris',
  speed: 'stripes',
  tech: 'stripes',
  web: 'stripes',
  size: 'stripes',
  nature: 'stripes',
};

const SECTION: Record<string, string> = {
  '': 'HOME BASE',
  roster: 'THE ROSTER',
  c: 'CASE FILE',
  originals: 'CM ORIGINALS',
  themes: 'THEME SHOP',
  rumours: 'RUMOUR MILL',
  versus: 'VERSUS',
  arena: 'THE ARENA',
  about: 'THE FINE PRINT',
  join: 'NEW RECRUIT',
  login: 'WELCOME BACK',
};

interface SceneProps {
  dur: number;
  title: string;
  sfx: string;
}

function Burst({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} style={style} aria-hidden>
      <polygon
        points={Array.from({ length: 28 }, (_, i) => {
          const r = i % 2 ? 30 : 48;
          const a = (i / 28) * Math.PI * 2;
          return `${Math.cos(a) * r},${Math.sin(a) * r}`;
        }).join(' ')}
        fill="currentColor"
        stroke="#0d0b10"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Panel slam: halftone panel, a burst spins up, the title slams down, an SFX word pops. */
function Slam({ dur, title, sfx }: SceneProps) {
  return (
    <div className="halftone absolute inset-0 grid place-items-center overflow-hidden bg-c1 text-on-c1">
      <m.div
        className="absolute"
        initial={{ scale: 0, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.05 }}
      >
        <Burst className="size-[min(120vw,120vh)] text-c3" />
      </m.div>
      <m.p
        className="h-display ink-text relative px-4 text-center text-[clamp(3rem,14vw,10rem)] text-c1-text"
        style={{ color: 'var(--on-c3)' }}
        initial={{ scale: 3, y: -40, rotate: -8 }}
        animate={{ scale: 1, y: 0, rotate: -3 }}
        transition={{ type: 'spring', stiffness: 520, damping: 18, delay: dur * 0.18 }}
      >
        {title}
      </m.p>
      <m.p
        className="h-display ink-text absolute top-[14%] right-[8%] text-[clamp(2rem,8vw,5rem)]"
        style={{ color: 'var(--c3-text)' }}
        initial={{ scale: 0, rotate: 20 }}
        animate={{ scale: 1, rotate: 8 }}
        transition={{ type: 'spring', stiffness: 600, damping: 12, delay: dur * 0.42 }}
      >
        {sfx}
      </m.p>
    </div>
  );
}

/** Halftone iris: an ink iris closes onto the title badge, then the page opens behind it. */
function Iris({ dur, title }: SceneProps) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden">
      {/* Transform only (no width/height animation): the ring starts 8× and closes to size. */}
      <m.div
        className="absolute size-[min(70vw,420px)] rounded-full border-[6px] border-line bg-c2"
        style={{ boxShadow: '0 0 0 200vmax #0d0b10' }}
        initial={{ scale: 8 }}
        animate={{ scale: 1 }}
        transition={{ duration: dur * 0.45, ease: [0.16, 1, 0.3, 1] }}
      />
      <m.div
        className="halftone relative grid size-[min(60vw,360px)] place-items-center rounded-full bg-c1 text-on-c1"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16, delay: dur * 0.3 }}
      >
        <p className="h-display px-6 text-center text-[clamp(2rem,8vw,4.5rem)] leading-none">
          {title}
        </p>
      </m.div>
    </div>
  );
}

/** Speed stripes: three diagonal palette bands sweep across; the title rides the middle one. */
function Stripes({ dur, title }: SceneProps) {
  const bands = ['bg-c1', 'bg-c2', 'bg-c3'];
  return (
    <div className="absolute inset-0 overflow-hidden">
      {bands.map((b, i) => (
        <m.div
          key={b}
          className={`absolute inset-y-[-20%] -left-1/4 w-[150%] -skew-x-12 border-y-[6px] border-line ${b}`}
          style={{ top: `${i * 33 - 10}%`, height: '40%' }}
          initial={{ x: i % 2 ? '100%' : '-100%' }}
          animate={{ x: '0%' }}
          transition={{ duration: dur * 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
      <m.p
        className="h-display ink-text absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[clamp(2.5rem,10vw,7rem)] text-fg"
        style={{ color: 'var(--on-c2)' }}
        initial={{ x: '-30%', skewX: -20 }}
        animate={{ x: '0%', skewX: -6 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20, delay: dur * 0.2 }}
      >
        {title}
      </m.p>
    </div>
  );
}

const SCENES: Record<SceneKind, (p: SceneProps) => React.ReactElement> = {
  slam: Slam,
  iris: Iris,
  stripes: Stripes,
};

type Show = { kind: SceneKind; intro: boolean; id: number; title: string };
let seq = 1;

export function LoaderStage({ playIntro }: { playIntro: boolean }) {
  const location = useLocation();
  const navigation = useNavigation();
  const animate = useAnimate();
  const { current } = useTheme();
  const sfx = SFX[current.motif][0] ?? 'KAPOW!';
  // The intro is fixed at first render so server and client agree.
  const [show, setShow] = useState<Show | null>(() =>
    playIntro ? { kind: 'slam', intro: true, id: 1, title: 'COMIC MUTANT' } : null,
  );
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const startedAt = useRef(0);
  // Back/Forward: popstate fires before the router starts loading, so the transit can skip it.
  const popped = useRef(false);
  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const end = useCallback(() => {
    clearTimeout(timer.current);
    setShow(null);
  }, []);

  const schedule = useCallback((s: Show) => {
    clearTimeout(timer.current);
    startedAt.current = performance.now();
    setShow(s);
    timer.current = setTimeout(() => setShow(null), s.intro ? INTRO_S * 1000 : TRANSIT_MAX_MS);
  }, []);

  // Hydration: remember the intro played this session; skip it when motion is off.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once on mount by design.
  useEffect(() => {
    setHydrated(true);
    if (!show) return;
    // biome-ignore lint/suspicious/noDocumentCookie: a plain session cookie the server reads.
    document.cookie = 'cm_seen=1; Path=/; SameSite=Lax';
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) end();
    else schedule(show);
  }, []);

  // Transit: only when the pathname changes (not filters/search params), never on game screens.
  const target = navigation.location?.pathname;
  useEffect(() => {
    if (!animate || !target || navigation.state !== 'loading') return;
    if (popped.current) {
      popped.current = false;
      return;
    }
    if (target === location.pathname || target.startsWith('/arena/')) return;
    const first = target.split('/')[1] ?? '';
    schedule({
      kind: SCENE_FOR[current.motif],
      intro: false,
      id: ++seq,
      title: SECTION[first] ?? 'NEXT ISSUE',
    });
  }, [navigation.state, target, location.pathname, animate, current.motif, schedule]);

  // The new page is in: lift the transit (after its minimum beat).
  useEffect(() => {
    if (!show || show.intro || navigation.state !== 'idle') return;
    const left = Math.max(0, TRANSIT_MIN_MS - (performance.now() - startedAt.current));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(null), left);
  }, [navigation.state, show]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && end();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, end]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const Scene = show ? SCENES[show.kind] : null;
  return (
    <AnimatePresence>
      {show && Scene && (
        <m.div
          key={show.id}
          // Transits let clicks through (the page under them is already live); the intro is clickable.
          className={`fixed inset-0 z-[150] ${show.intro ? 'cursor-pointer' : 'pointer-events-none'} ${!hydrated ? 'intro-curtain' : ''}`}
          initial={show.intro ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          // Exit (0.1s) is faster than entrance (0.15s) (Pro Max motion rule).
          exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.1 } }}
          transition={{ duration: 0.15 }}
          onClick={show.intro ? end : undefined}
          data-testid="loader"
          data-scene={show.kind}
        >
          <div aria-hidden className="absolute inset-0">
            {hydrated ? (
              <Scene dur={show.intro ? INTRO_S : TRANSIT_S} title={show.title} sfx={sfx} />
            ) : (
              <div className="halftone absolute inset-0 bg-c1" />
            )}
          </div>
          <button
            type="button"
            onClick={end}
            className="btn btn-sm pointer-events-auto absolute right-5 bottom-5 z-10"
          >
            Skip
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
