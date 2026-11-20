/**
 * Shared frame for every arena game: reserved 16:9 canvas, fixed-step loop, input, audio, FX,
 * start / pause / result screens, touch pad, mute, and the screen-reader channel
 * (canvas role="img" + a live region + a periodically refreshed text description).
 * A game only supplies `create(env) → Sim` plus its control legend.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAnimate } from '~/lib/fx';
import { Sfx } from '../engine/audio';
import { fitCanvas } from '../engine/canvas';
import { FxWorld } from '../engine/fx';
import { type Action, Input } from '../engine/input';
import { createLoop } from '../engine/loop';
import { SpriteClip } from '../SpriteClip';
import type {
  Control,
  GameId,
  GameProps,
  GameResult,
  Sim,
  SimEnv,
  StartOption,
  TouchLayout,
} from '../types';
import { GAME_TITLES } from '../types';
import { H, W } from './const';

export { H, W };

export type Phase = 'start' | 'playing' | 'paused' | 'over';

export interface GameShellProps extends GameProps {
  game: GameId;
  blurb: string;
  controls: { p1: Control[]; p2?: Control[] };
  touch: TouchLayout;
  startOptions?: StartOption[];
  create: (env: SimEnv) => Sim;
  /** Extra DOM under the canvas (quiz answers). Receives the live sim. */
  panel?: (sim: Sim | null, phase: Phase) => ReactNode;
  /** Hide the canvas-level touch pad (quiz uses DOM buttons). */
  noPad?: boolean;
  /** Cap the canvas height (dvh) so a DOM panel under it stays above the fold (quiz). */
  maxHeightVh?: number;
  /** Extra line under the key table on the start/pause menus (defaults to the action-game hint). */
  keysHint?: string;
  /** Unit after the result score, e.g. "HP". */
  scoreUnit?: string;
}

export function GameShell(props: GameShellProps) {
  const {
    game,
    p1,
    p2,
    vs,
    difficulty,
    onEnd,
    controls,
    touch,
    startOptions,
    create,
    panel,
    noPad,
    blurb,
    maxHeightVh,
    keysHint = 'Arrows + J/K/L also work. Gamepads supported. Esc pauses.',
    scoreUnit,
  } = props;
  const animate = useAnimate();
  const reduced = !animate;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>('start');
  const phaseRef = useRef<Phase>('start');
  const [result, setResult] = useState<GameResult | null>(null);
  const [live, setLive] = useState('');
  const [desc, setDesc] = useState('');
  const [muted, setMuted] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries((startOptions ?? []).map((o) => [o.id, o.choices[0]?.value ?? ''])),
  );
  const [sim, setSim] = useState<Sim | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  useEffect(() => {
    setCanFull(!!document.fullscreenEnabled);
    const on = () => setFull(document.fullscreenElement === sectionRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void sectionRef.current?.requestFullscreen?.().catch(() => {});
  };
  const core = useRef<{ input: Input; sfx: Sfx; fx: FxWorld; sim: Sim | null } | null>(null);
  const loopRef = useRef<ReturnType<typeof createLoop> | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const makeSim = useCallback(
    (s: Record<string, string>) => {
      const c = core.current;
      if (!c) return;
      c.fx.particles.length = 0;
      c.fx.pops.length = 0;
      c.fx.timeScale = 1;
      c.input.reset();
      const env: SimEnv = {
        p1,
        p2,
        vs,
        difficulty,
        sfx: c.sfx,
        fx: c.fx,
        reduced,
        settings: s,
        announce: (m) => setLive(m),
        end: (r) => {
          const full: GameResult = { ...r, game };
          clearTimeout(endTimer.current);
          endTimer.current = setTimeout(() => {
            setResult(full);
            go('over');
            onEndRef.current(full);
          }, 1600);
        },
      };
      c.sim = create(env);
      setSim(c.sim);
      setDesc(c.sim.describe());
    },
    [p1, p2, vs, difficulty, reduced, create, game, go],
  );

  // Engine lifetime: one per mounted game (rebuilt only when the matchup changes; start options
  // are applied by makeSim on Start, so they are deliberately not dependencies here).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const input = new Input(vs === 'cpu');
    const sfx = new Sfx();
    setMuted(sfx.muted);
    const fx = new FxWorld(reduced);
    core.current = { input, sfx, fx, sim: null };
    // A resize clears the backing store; a sleeping loop (start/pause/result screens) must repaint
    // its still frame or the canvas stays blank.
    const vp = fitCanvas(canvas, W, H, () => {
      if (loopRef.current?.sleeping) loopRef.current.sleep();
    });
    makeSim(settings);
    const loop = createLoop({
      update: (dt) => {
        const c = core.current;
        if (!c?.sim) return;
        const ph = phaseRef.current;
        if (ph !== 'playing' && ph !== 'over') return;
        input.poll();
        fx.update(dt);
        // During hit-stop the sim is frozen; keep this frame's presses for the first free step
        // (clearing them here dropped combo inputs).
        if (fx.hitstop > 0) fx.hitstop--;
        else {
          c.sim.update(dt * fx.timeScale, input);
          input.endStep();
        }
      },
      render: (a) => {
        const c = core.current;
        vp.apply(ctx);
        ctx.clearRect(0, 0, W, H);
        c?.sim?.render(ctx, a);
      },
      onAutoPause: () => {
        if (phaseRef.current === 'playing') {
          go('paused');
          setLive('Paused');
        }
      },
    });
    loop.start();
    loopRef.current = loop;
    if (phaseRef.current !== 'playing') loop.sleep();
    const descTimer = setInterval(() => {
      const s = core.current?.sim;
      if (s && phaseRef.current === 'playing') setDesc(s.describe());
    }, 2500);
    return () => {
      loop.destroy();
      loopRef.current = null;
      vp.dispose();
      input.detach();
      sfx.dispose();
      clearInterval(descTimer);
      clearTimeout(endTimer.current);
      core.current = null;
    };
    // The engine is rebuilt only when the matchup changes; settings are applied on start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p1.slug, p2.slug, vs, difficulty]);

  // Only animate while playing; start / pause / result screens show one still frame (no 60 fps).
  useEffect(() => {
    const l = loopRef.current;
    if (!l) return;
    if (phase === 'playing') {
      // An auto-pause (tab switch / window blur) set the loop's paused flag; Resume and Restart must
      // clear it or the game comes back frozen.
      l.setPaused(false);
      l.wake();
    } else l.sleep();
  }, [phase]);

  // Keyboard input only while playing; Esc / P toggles pause.
  useEffect(() => {
    const c = core.current;
    if (!c) return;
    if (phase === 'playing') c.input.attach(window);
    else c.input.detach();
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (phaseRef.current === 'playing') {
        e.preventDefault();
        go('paused');
        setLive('Paused');
      } else if (phaseRef.current === 'paused') {
        e.preventDefault();
        go('playing');
        setLive('Resumed');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      c.input.detach();
    };
  }, [phase, go]);

  // Move focus into whichever overlay opens; back to the canvas when play starts.
  useEffect(() => {
    if (phase === 'playing') {
      if (!noPad) canvasRef.current?.focus({ preventScroll: true });
    } else primaryRef.current?.focus({ preventScroll: true });
  }, [phase, noPad]);

  // Phones: when play starts, put the canvas top just under the sticky header (HUD visible); when a
  // menu or the result opens, bring its top into view. Measured, not scrollIntoView: the page's
  // scroll-padding would stack on top of the header offset.
  // Desktop does the same only when the canvas would otherwise be clipped. The quiz positions its own
  // canvas + answers during play.
  useEffect(() => {
    if (document.fullscreenElement) return;
    if (phase === 'playing' && maxHeightVh) return;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const el = phase === 'playing' ? boxRef.current : overlayRef.current;
    if (!el) return;
    // After a short delay: on first load the router's scroll restoration runs after this effect
    // and would put the page back to the top.
    const t = setTimeout(() => {
      const head = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      const r = el.getBoundingClientRect();
      const clipped = r.top < head || r.bottom > window.innerHeight;
      // A menu counts as visible only if its main button (Start / Resume / Replay) is on screen.
      const btn = primaryRef.current?.getBoundingClientRect();
      const visible = r.top >= head && (!btn || btn.bottom <= window.innerHeight);
      const go = touch ? phase === 'playing' || !visible : clipped;
      if (go) window.scrollTo({ top: window.scrollY + r.top - head - 6, behavior: 'instant' });
    }, 120);
    return () => clearTimeout(t);
  }, [phase, maxHeightVh]);

  const start = () => {
    core.current?.sfx.unlock();
    core.current?.sfx.play('blip');
    makeSim(settings);
    setResult(null);
    go('playing');
    setLive(`${p1.alias} versus ${p2.alias}. Go!`);
  };

  const toggleMute = () => {
    const s = core.current?.sfx;
    if (!s) return;
    s.unlock();
    s.setMuted(!s.muted);
    setMuted(s.muted);
  };

  const label = `${GAME_TITLES[game]}: ${p1.alias} versus ${p2.alias}`;
  const winner = result?.winner === 'p1' ? p1 : result?.winner === 'p2' ? p2 : null;
  const p2Label = vs === 'cpu' ? `${p2.alias} (CPU, ${difficulty})` : `${p2.alias} (Player 2)`;

  return (
    <section
      ref={sectionRef}
      aria-label={GAME_TITLES[game]}
      className={`w-full ${full ? 'flex items-center justify-center bg-bg' : ''}`}
    >
      {/* Wrapper = the 16:9 box plus whatever flows below it on small screens (menus, touch pad). */}
      <div
        className={`relative mx-auto ${maxHeightVh ? 'flex flex-col' : ''} ${full || maxHeightVh ? '' : 'game-box-w'}`}
        style={{
          width: full
            ? 'min(100vw, calc(100dvh * 16 / 9))'
            : maxHeightVh
              ? `min(100%, calc(min(100dvh - 6.5rem, ${maxHeightVh}dvh) * 16 / 9))`
              : undefined,
        }}
      >
        <div
          ref={boxRef}
          className="panel relative w-full overflow-hidden"
          style={{ aspectRatio: '16 / 9', touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={label}
            tabIndex={-1}
            className="absolute inset-0 block h-full w-full select-none outline-none"
            style={{ touchAction: 'none' }}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        {(phase === 'playing' || phase === 'over') && (
          // Below the canvas (never over the field or the HUD); on a landscape phone, where there
          // is no room below, a slim column on the right edge between the HUD and the pad.
          <div
            className={`mt-2 flex justify-center gap-2 ${noPad ? '' : 'touchland:fixed touchland:top-20 touchland:right-3 touchland:z-30 touchland:mt-0 touchland:flex-col'}`}
          >
            <button
              type="button"
              className="btn btn-sm min-h-[44px] min-w-[44px]"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            >
              {muted ? 'Muted' : 'Sound'}
            </button>
            {canFull && (
              <button
                type="button"
                className="btn btn-sm min-h-[44px] min-w-[44px]"
                onClick={toggleFull}
                aria-pressed={full}
              >
                {full ? 'Exit full' : 'Full'}
              </button>
            )}
            {phase === 'playing' && (
              <button
                type="button"
                className="btn btn-sm min-h-[44px] min-w-[44px]"
                aria-label="Pause"
                onClick={() => {
                  go('paused');
                  setLive('Paused');
                }}
              >
                II
              </button>
            )}
          </div>
        )}

        {phase === 'playing' && !noPad && (
          <TouchPad input={core.current?.input ?? null} layout={touch} />
        )}

        {phase === 'start' && (
          <Overlay full={full} flowAlways={!!maxHeightVh} innerRef={overlayRef}>
            {/* Touch: title → Start → the rest (keyboard table swapped for a pad legend), so Start is
                on screen on a landscape phone. */}
            <p className="kicker coarse:-order-3">
              {vs === 'cpu' ? 'Single player' : 'Two players · one keyboard'}
            </p>
            <h2 className="h-display ink-text text-4xl text-c3 sm:text-6xl coarse:-order-3 cramped:text-3xl">
              {GAME_TITLES[game]}
            </h2>
            <p className="h-head text-base sm:text-xl coarse:-order-2">
              <span className="text-c1-text">{p1.alias}</span>{' '}
              <span className="text-muted">vs</span> <span>{p2Label}</span>
            </p>
            <p className="max-w-prose text-sm text-muted">{blurb}</p>
            <div className="coarse:hidden">
              <ControlTable
                controls={controls}
                local={vs === 'local'}
                p1={p1.alias}
                p2={p2.alias}
                hint={keysHint}
              />
            </div>
            {!noPad && (
              <p className="hidden max-w-prose text-sm coarse:block">
                On-screen pad: the arrows move{touch.vertical ? '' : ', the top arrow jumps'}
                {[touch.a, touch.b, touch.c].filter(Boolean).length > 0 &&
                  `; ${[touch.a, touch.b, touch.c].filter(Boolean).join(', ')} on the right`}
                .
              </p>
            )}
            {startOptions?.map((o) => (
              <fieldset key={o.id} className="flex flex-wrap items-center justify-center gap-2">
                <legend className="sr-only">{o.label}</legend>
                <span className="kicker" aria-hidden>
                  {o.label}
                </span>
                {o.choices.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className="chip min-h-[44px]"
                    aria-pressed={settings[o.id] === c.value}
                    onClick={() => setSettings((s) => ({ ...s, [o.id]: c.value }))}
                  >
                    {c.label}
                  </button>
                ))}
              </fieldset>
            ))}
            <div className="flex flex-wrap justify-center gap-3 coarse:-order-1">
              <button ref={primaryRef} type="button" className="btn btn-c1 text-lg" onClick={start}>
                Start
              </button>
              {canFull && (
                <button type="button" className="btn" onClick={toggleFull} aria-pressed={full}>
                  {full ? 'Exit fullscreen' : 'Fullscreen'}
                </button>
              )}
              <Link to={`/arena?game=${game}`} className="btn">
                Back to arena
              </Link>
            </div>
          </Overlay>
        )}

        {phase === 'paused' && (
          <Overlay full={full} flowAlways={!!maxHeightVh} innerRef={overlayRef}>
            <h2 className="h-display ink-text text-5xl text-c3">Paused</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                ref={primaryRef}
                type="button"
                className="btn btn-c1"
                onClick={() => {
                  go('playing');
                  setLive('Resumed');
                }}
              >
                Resume
              </button>
              <button type="button" className="btn" onClick={start}>
                Restart
              </button>
              <button type="button" className="btn" onClick={toggleMute} aria-pressed={muted}>
                {muted ? 'Sound off' : 'Sound on'}
              </button>
              <Link to="/arena" className="btn">
                Quit to arena
              </Link>
            </div>
            <div className="coarse:hidden">
              <ControlTable
                controls={controls}
                local={vs === 'local'}
                p1={p1.alias}
                p2={p2.alias}
                hint={keysHint}
              />
            </div>
          </Overlay>
        )}

        {phase === 'over' && result && (
          <Overlay full={full} flowAlways={!!maxHeightVh} innerRef={overlayRef}>
            <p className="kicker">
              {result.winner === 'draw'
                ? game === 'football'
                  ? 'Full time'
                  : 'Dead heat'
                : 'Winner'}
            </p>
            <h2 className="h-display ink-text text-4xl text-c3 sm:text-6xl cramped:text-3xl">
              {result.winner === 'draw' ? 'Draw!' : `${winner?.alias} wins!`}
            </h2>
            {/* Actions first: on a short landscape phone they must be on screen without scrolling. */}
            <div className="flex flex-wrap justify-center gap-3">
              <button ref={primaryRef} type="button" className="btn btn-c1" onClick={start}>
                Replay
              </button>
              <Link to={`/arena?game=${game}&p1=${p1.slug}&p2=${p2.slug}`} className="btn">
                Change fighters
              </Link>
              <Link to="/arena" className="btn">
                Back to arena
              </Link>
            </div>
            <div className="flex items-end justify-center gap-3 [@media(max-height:500px)]:hidden">
              {(winner ? [winner] : [p1, p2]).map((f) => (
                <div
                  key={f.slug}
                  className="w-28 overflow-hidden rounded border-3 border-line sm:w-40"
                >
                  <SpriteClip fighter={f} pose={winner ? 'victory' : 'idle'} autoPlay />
                </div>
              ))}
            </div>
            <p className="h-head text-2xl">
              <span className="sr-only">Score </span>
              {result.score[0]} – {result.score[1]}
              {scoreUnit && <span className="ml-1 text-base text-muted">{scoreUnit}</span>}
            </p>
            <p className="text-sm text-muted">{result.summary}</p>
            {winner && <p className="bubble max-w-sm text-sm">“{winner.catchphrase}”</p>}
          </Overlay>
        )}
      </div>

      {panel?.(sim, phase)}

      {!noPad && (
        <div className="mx-auto mt-3 hidden max-w-3xl md:block">
          <ControlTable
            controls={controls}
            local={vs === 'local'}
            p1={p1.alias}
            p2={p2.alias}
            compact
          />
        </div>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </p>
      <p className="sr-only">{desc}</p>
    </section>
  );
}

/**
 * Menus sit over the canvas on roomy screens; on cramped ones (phones, tablets, short landscape) they
 * flow below it so every control is reachable and the page scrolls normally. `safe center` keeps the
 * top of an overflowing menu reachable instead of clipping it.
 */
function Overlay({
  children,
  full,
  flowAlways,
  innerRef,
}: {
  children: ReactNode;
  full: boolean;
  /** A height-capped canvas (quiz) is too short for any menu: it flows above the canvas instead. */
  flowAlways?: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const flow = full
    ? ''
    : flowAlways
      ? // Above the short canvas, so Start / Replay are on screen without scrolling.
        '-order-1 static mb-3 overflow-visible rounded border-3 border-line bg-card'
      : 'cramped:static cramped:mt-3 cramped:overflow-visible cramped:rounded cramped:border-3 cramped:border-line cramped:bg-card';
  return (
    <div
      ref={innerRef}
      className={`absolute inset-0 z-20 flex flex-col items-center justify-[safe_center] gap-3 overflow-y-auto bg-bg/80 p-4 text-center backdrop-blur-[2px] ${flow}`}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
}

function ControlTable({
  controls,
  local,
  p1,
  p2,
  compact,
  hint,
}: {
  controls: { p1: Control[]; p2?: Control[] };
  local: boolean;
  p1: string;
  p2: string;
  compact?: boolean;
  hint?: string;
}) {
  const cols: [string, Control[]][] = [[local ? `P1 · ${p1}` : 'Keys', controls.p1]];
  if (local && controls.p2) cols.push([`P2 · ${p2}`, controls.p2]);
  return (
    <div
      className={`grid gap-3 text-left ${cols.length > 1 ? 'sm:grid-cols-2' : ''} ${compact ? 'text-xs' : 'text-xs sm:text-sm'}`}
    >
      {cols.map(([title, list]) => (
        <div key={title} className="panel px-3 py-2">
          <p className="kicker mb-1">{title}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {list.map((c) => (
              <div key={c.does} className="contents">
                <dt>
                  <kbd className="rounded border-2 border-line bg-bg px-1 font-head text-fg">
                    {c.keys}
                  </kbd>
                </dt>
                <dd>{c.does}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {!local && hint && <p className="text-muted sm:col-span-2">{hint}</p>}
    </div>
  );
}

/** Pad arrow as an SVG (text arrows can render as emoji on iOS). `turn` in degrees from "up". */
function Arrow({ turn, jump }: { turn: number; jump?: boolean }) {
  return (
    <svg viewBox="-10 -10 20 20" className="size-5" style={{ rotate: `${turn}deg` }} aria-hidden>
      <path d="M0,-7 L7,5 L-7,5 Z" fill="currentColor" />
      {jump && <rect x="-7" y="-9.5" width="14" height="2.5" fill="currentColor" />}
    </svg>
  );
}

/** On-screen pad for touch devices (P1). Multi-touch: every button tracks its own pointer. */
function TouchPad({ input, layout }: { input: Input | null; layout: TouchLayout }) {
  if (!input) return null;
  const bind = (a: Action) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      input.setTouch(0, a, true);
    },
    onPointerUp: () => input.setTouch(0, a, false),
    onPointerCancel: () => input.setTouch(0, a, false),
    onLostPointerCapture: () => input.setTouch(0, a, false),
  });
  // Over the canvas (landscape) the pad is see-through; below it (portrait) it is solid and roomier.
  // Accent buttons carry their own solid portrait fill: one shared `touchport:bg-card` used to win
  // over them and left dark labels on a dark button.
  const padBase =
    'pointer-events-auto flex h-12 w-12 items-center justify-center round border-3 border-line font-head text-lg shadow-ink-sm active:bg-c3 active:text-on-c3 select-none touchport:h-14 touchport:w-14';
  const pad = `${padBase} bg-card/70 text-card-fg touchport:bg-card`;
  // Arrow cluster: left/right only for side-on games, a cross when the game uses up/down.
  const dpad = layout.vertical ? (
    <div className="grid grid-cols-[repeat(3,3rem)] grid-rows-2 gap-1.5 touchport:grid-cols-[repeat(3,3.5rem)] touchport:gap-2.5">
      <button type="button" tabIndex={-1} className={`${pad} col-start-2`} {...bind('up')}>
        <Arrow turn={0} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className={`${pad} col-start-1 row-start-2`}
        {...bind('left')}
      >
        <Arrow turn={-90} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className={`${pad} col-start-2 row-start-2`}
        {...bind('down')}
      >
        <Arrow turn={180} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className={`${pad} col-start-3 row-start-2`}
        {...bind('right')}
      >
        <Arrow turn={90} />
      </button>
    </div>
  ) : (
    <div className="flex items-end gap-2.5">
      <button type="button" tabIndex={-1} className={pad} {...bind('left')}>
        <Arrow turn={-90} />
      </button>
      <button type="button" tabIndex={-1} className={pad} {...bind('right')}>
        <Arrow turn={90} />
      </button>
    </div>
  );
  return (
    // Portrait: a row under the canvas. Landscape: fixed to the screen's side gutters (the 16:9
    // canvas leaves ~170px each side on a phone), so the pad never covers the field.
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 hidden items-end justify-between gap-4 p-2 [@media(pointer:coarse)]:flex touchport:static touchport:mt-2 touchport:px-1 touchland:fixed touchland:inset-x-0 touchland:bottom-2 touchland:px-3"
      aria-hidden
    >
      {dpad}
      {/* Actions as a 2×2 block: never wider than the gutter, never pushed off a 390px screen. */}
      <div className="grid grid-cols-[repeat(2,auto)] items-end justify-end gap-2.5">
        {!layout.vertical && (
          <button type="button" tabIndex={-1} className={pad} {...bind('up')}>
            <Arrow turn={0} jump />
          </button>
        )}
        {layout.c && (
          <button
            type="button"
            tabIndex={-1}
            className={`${padBase} bg-c3/80 text-on-c3 text-xs tracking-tighter touchport:bg-c3 touchland:bg-c3`}
            {...bind('c')}
          >
            {layout.c}
          </button>
        )}
        {layout.b && (
          <button
            type="button"
            tabIndex={-1}
            className={`${pad} text-xs tracking-tighter`}
            {...bind('b')}
          >
            {layout.b}
          </button>
        )}
        {layout.a && (
          <button
            type="button"
            tabIndex={-1}
            className={`${padBase} bg-c1/80 text-on-c1 text-xs tracking-tighter touchport:bg-c1 touchland:bg-c1`}
            {...bind('a')}
          >
            {layout.a}
          </button>
        )}
      </div>
    </div>
  );
}
