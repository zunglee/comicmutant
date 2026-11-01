/**
 * Freefall's own frame (it is a solo score-attack, not a P1-vs-P2 match, so it doesn't use GameShell):
 * orientation-aware canvas, fixed-step loop, keys + relative drag + Dive/Brake buttons, start / pause /
 * result screens, run tokens and posting. A guest's finished run waits in sessionStorage and is posted
 * after sign-in.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAnimate } from '~/lib/fx';
import type { Fighter } from '~/lib/schema';
import { Sfx } from '../engine/audio';
import { fitCanvas } from '../engine/canvas';
import { FxWorld } from '../engine/fx';
import { createLoop } from '../engine/loop';
import { clamp } from '../engine/math';
import { SpriteClip } from '../SpriteClip';
import { type Ctl, LANES, type Miss, type Summary, SW } from './core';
import { fmt, LEVEL_LABEL, LEVELS, type Level } from './maths';
import { keepPending, type Posted, postRun, readPending } from './post';
import { LANDSCAPE, type Layout, PORTRAIT } from './render';
import { FreefallRun } from './run';

export type Mode = 'daily' | 'practice';
type Phase = 'start' | 'playing' | 'paused' | 'over';

interface Finished {
  summary: Summary;
  misses: Miss[];
  marks: boolean[];
  mode: Mode;
  level: Level;
  day: string;
  token: string | null;
  log: number[];
  hero: string;
  /** Daily: which start of today's tower (only 1 ranks). */
  attempt: number;
}

export interface FreefallProps {
  heroes: Fighter[];
  signedIn: boolean;
  day: string;
  /** Levels whose ranked daily dive this player has already posted (score). */
  ranked: Partial<Record<Level, number>>;
  /** Levels whose daily tower this player/device has already started today (start count). */
  started: Partial<Record<Level, number>>;
  initialLevel: Level;
  onPosted: () => void;
}

const portraitQuery = '(orientation: portrait) and (max-width: 820px)';

/** Still frame behind the start menu (before the first run). */
function idle(ctx: CanvasRenderingContext2D, L: Layout) {
  const g = ctx.createLinearGradient(0, 0, 0, L.H);
  g.addColorStop(0, '#1b1230');
  g.addColorStop(1, '#f2994a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
}

/** The end ping, with up to three retries a second apart. */
async function pingEnd(token: string, step: number) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch('/api/freefall/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, step }),
        keepalive: true,
      });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function shareText(f: Finished): string {
  const grid = f.marks
    .slice(0, 30)
    .map((m) => (m ? '🟩' : '🟥'))
    .join('');
  const s = f.summary;
  return [
    `ComicMutant FREEFALL · ${f.mode === 'daily' ? f.day : 'practice'} · ${LEVEL_LABEL[f.level]}`,
    grid,
    `${s.score.toLocaleString('en-IN')} pts · floor ${s.floors} · ${s.correct}/${s.asked} sums · ${s.saved} saved`,
  ].join('\n');
}

export default function FreefallGame(props: FreefallProps) {
  const { heroes, signedIn, day, ranked, initialLevel, onPosted } = props;
  const [started, setStarted] = useState(props.started);
  const animate = useAnimate();
  const reduced = !animate;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>('start');
  const phaseRef = useRef<Phase>('start');
  const [portrait, setPortrait] = useState(false);
  const layoutRef = useRef<Layout>(LANDSCAPE);
  const [mode, setMode] = useState<Mode>('daily');
  const [level, setLevel] = useState<Level>(initialLevel);
  const [heroSlug, setHeroSlug] = useState(heroes[0]?.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [live, setLive] = useState('');
  const [desc, setDesc] = useState('');
  const [muted, setMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const engine = useRef<{ sfx: Sfx; fx: FxWorld } | null>(null);
  const runRef = useRef<FreefallRun | null>(null);
  const tokenRef = useRef<{ token: string | null; mode: Mode; day: string; attempt: number }>({
    token: null,
    mode: 'daily',
    day,
    attempt: 1,
  });
  const loopRef = useRef<ReturnType<typeof createLoop> | null>(null);
  const ctl = useRef({ left: false, right: false, dive: false, brake: false, target: -1 });
  const drag = useRef<{ id: number; x0: number; hx: number } | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hero = heroes.find((h) => h.slug === heroSlug) ?? heroes[0];
  const go = useCallback((p: Phase) => {
    // Every pause goes into the run's log (the server counts them: thinking time on pause is free).
    const run = runRef.current;
    if (p === 'paused' && phaseRef.current === 'playing' && run && !run.core.over)
      run.rec.pause(run.core.step);
    if (p === 'playing' && phaseRef.current === 'paused' && run) run.rec.resume();
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // Orientation picks the canvas shape (the world inside is the same either way).
  useEffect(() => {
    const mq = window.matchMedia(portraitQuery);
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Engine: one per mount; the canvas is re-fitted whenever the layout changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const L = portrait ? PORTRAIT : LANDSCAPE;
    layoutRef.current = L;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const sfx = engine.current?.sfx ?? new Sfx();
    const fx = engine.current?.fx ?? new FxWorld(reduced);
    // `reduced` can resolve after the first mount (media query): no shake or flash once it does.
    fx.reduced = reduced;
    engine.current = { sfx, fx };
    setMuted(sfx.muted);
    const vp = fitCanvas(canvas, L.W, L.H, () => {
      if (loopRef.current?.sleeping) loopRef.current.sleep();
    });
    const loop = createLoop({
      update: (dt) => {
        const run = runRef.current;
        if (!run || phaseRef.current !== 'playing') return;
        fx.update(dt);
        if (fx.hitstop > 0) {
          fx.hitstop--;
          return;
        }
        const c = ctl.current;
        const input: Ctl = {
          steer: c.left === c.right ? 0 : c.left ? -1 : 1,
          target: c.target,
          dive: c.dive,
          brake: c.brake,
        };
        run.step(input);
        if (run.core.over && !endTimer.current) {
          // Tell the server the run ended now, and at which step (wall-clock check). Retried: a lost
          // end ping would otherwise hold an honest run.
          const token = tokenRef.current.token;
          if (token) void pingEnd(token, run.core.step);
          endTimer.current = setTimeout(() => finishRef.current(run), 1300);
        }
      },
      render: (a) => {
        vp.apply(ctx);
        ctx.clearRect(0, 0, L.W, L.H);
        const run = runRef.current;
        if (run)
          run.render(
            ctx,
            L,
            phaseRef.current === 'playing' ? a : 0,
            reduced,
            touch,
            phaseRef.current === 'paused',
          );
        else idle(ctx, L);
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
    return () => {
      loop.destroy();
      loopRef.current = null;
      vp.dispose();
    };
  }, [portrait, reduced, go]);

  useEffect(
    () => () => {
      engine.current?.sfx.dispose();
      clearTimeout(endTimer.current);
    },
    [],
  );

  useEffect(() => {
    const l = loopRef.current;
    if (!l) return;
    if (phase === 'playing') {
      l.setPaused(false);
      l.wake();
    } else l.sleep();
  }, [phase]);

  // A landscape phone has no room for the page header and the start menu: start with the game in view.
  // (Not when coming back from sign-in with a guest run to post: its result banner must stay in view.)
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse) and (orientation: landscape)').matches) return;
    const waiting = readPending();
    if (waiting.daily || waiting.practice || new URLSearchParams(location.search).has('post'))
      return;
    const t = setTimeout(
      () => boxRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }),
      150,
    );
    return () => clearTimeout(t);
  }, []);

  // On this page a landscape phone never shows the bottom tab bar or the dock: the 16:9 game needs
  // the height, and the tab bar would sit over the Start button.
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-ff', '');
    return () => el.removeAttribute('data-ff');
  }, []);

  // Floating site chrome (theme dock, phone tab bar) hides while diving.
  useEffect(() => {
    const el = document.documentElement;
    // Paused and result screens keep the full-screen layout too (no jump, result stays in view).
    if (phase !== 'start') el.setAttribute('data-in-game', '');
    else el.removeAttribute('data-in-game');
    return () => el.removeAttribute('data-in-game');
  }, [phase]);

  // Progress pings while playing (every 10 s): the server checks the run's pace against them.
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      const run = runRef.current;
      const token = tokenRef.current.token;
      if (!run || !token || run.core.over) return;
      void fetch('/api/freefall/tick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, step: run.core.step }),
        keepalive: true,
      }).catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [phase]);

  // Screen-reader description while playing (cleared on pause: no reading the sum off the pause menu).
  useEffect(() => {
    if (phase !== 'playing') {
      setDesc(phase === 'paused' ? 'Paused.' : '');
      return;
    }
    const id = setInterval(() => {
      const r = runRef.current;
      if (r) setDesc(r.describe());
    }, 2500);
    return () => clearInterval(id);
  }, [phase]);

  // Keys while playing: arrows/WASD, 1/2/3 lanes, Esc/P pause.
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
        return;
      const c = ctl.current;
      const p = phaseRef.current;
      if (down && (e.code === 'Escape' || e.code === 'KeyP')) {
        if (p === 'playing') {
          e.preventDefault();
          go('paused');
          setLive('Paused');
        } else if (p === 'paused') {
          e.preventDefault();
          go('playing');
          setLive('Resumed');
        }
        return;
      }
      if (p !== 'playing') return;
      const lane = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (lane !== undefined) {
        if (down) c.target = LANES[lane] as number;
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        c.left = down;
        if (down) c.target = -1;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        c.right = down;
        if (down) c.target = -1;
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') c.dive = down;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') c.brake = down;
      else return;
      e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    const blur = () => {
      ctl.current = { left: false, right: false, dive: false, brake: false, target: -1 };
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [go]);

  // Focus: canvas while playing, the menu's main button otherwise.
  useEffect(() => {
    if (phase === 'playing') canvasRef.current?.focus({ preventScroll: true });
    else primaryRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // Keep the whole canvas on screen under the sticky header when play starts.
  useEffect(() => {
    if (phase !== 'playing' || document.fullscreenElement) return;
    const t = setTimeout(() => {
      const el = boxRef.current;
      if (!el) return;
      const head = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      const r = el.getBoundingClientRect();
      if (r.top < head || r.bottom > window.innerHeight)
        window.scrollTo({ top: window.scrollY + r.top - head - 6, behavior: 'instant' });
    }, 80);
    return () => clearTimeout(t);
  }, [phase]);

  function finish(run: FreefallRun) {
    endTimer.current = undefined;
    const t = tokenRef.current;
    const f: Finished = {
      summary: run.core.summary(),
      misses: run.core.misses,
      marks: run.marks,
      mode: t.mode,
      level: run.core.level,
      day: t.day,
      token: t.token,
      log: run.rec.log,
      hero: run.hero.slug,
      attempt: t.attempt,
    };
    setFinished(f);
    setPosted(null);
    setCopied(false);
    go('over');
    const s = f.summary;
    setLive(
      `Run over. ${s.score} points, floor ${s.floors}, ${s.correct} of ${s.asked} sums right, ${s.saved} saved.`,
    );
    // A replay of today's tower never ranks: nothing to post or keep.
    if (!f.token || (f.mode === 'daily' && f.attempt !== 1)) return;
    if (!signedIn) {
      keepPending(f.mode, { token: f.token, log: f.log, score: s.score, level: f.level });
      return;
    }
    send(f);
  }

  /** Post a finished run; a network failure keeps it (this tab) and offers Retry. */
  function send(f: Finished) {
    if (!f.token) return;
    setPosted(null);
    const run = { token: f.token, log: f.log, score: f.summary.score, level: f.level };
    void postRun(f.token, f.log).then((p) => {
      setPosted(p);
      if (p.ok && p.stored) {
        setLive(
          p.review
            ? 'Verified. It is in its place on the board; your name shows after a moderator looks.'
            : p.pending
              ? `Posted at number ${p.rank}. Your name shows there once a moderator checks it.`
              : `Posted. Rank ${p.rank} of ${p.of}.`,
        );
        onPosted();
      } else if (!p.ok && p.error?.startsWith('Network')) keepPending(f.mode, run);
    });
  }

  // The loop (built once per layout) calls the latest finish().
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const start = async (m: Mode = mode, lv: Level = level) => {
    if (busy || !hero) return;
    setBusy(true);
    const e = engine.current;
    e?.sfx.unlock();
    e?.sfx.play('blip');
    let seed = (Math.random() * 2 ** 32) >>> 0;
    let token: string | null = null;
    let runDay = day;
    let attempt = 1;
    let qseed = seed;
    try {
      const res = await fetch('/api/freefall/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: m, level: lv }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        token?: string;
        seed?: number;
        day?: string;
        attempt?: number;
        qseed?: number;
      };
      if (j.ok && j.token && j.seed) {
        token = j.token;
        seed = j.seed;
        runDay = j.day ?? day;
        attempt = j.attempt ?? 1;
        qseed = j.qseed ?? j.seed;
      }
    } catch {
      /* offline: an unranked local run */
    }
    setBusy(false);
    if (!e) return;
    clearTimeout(endTimer.current);
    endTimer.current = undefined;
    e.fx.particles.length = 0;
    e.fx.pops.length = 0;
    e.fx.trauma = 0;
    e.fx.hitstop = 0;
    ctl.current = { left: false, right: false, dive: false, brake: false, target: -1 };
    tokenRef.current = { token, mode: m, day: runDay, attempt };
    if (m === 'daily' && token) setStarted((x) => ({ ...x, [lv]: attempt }));
    setMode(m);
    setLevel(lv);
    runRef.current = new FreefallRun(seed, lv, hero, e.fx, e.sfx, setLive, qseed);
    // QA harness (scripts/freefall-shots.ts) reads the live run in dev builds only.
    if (import.meta.env.DEV) (window as unknown as { __ff?: FreefallRun }).__ff = runRef.current;
    setFinished(null);
    setPosted(null);
    go('playing');
  };

  const toggleMute = () => {
    const s = engine.current?.sfx;
    if (!s) return;
    s.unlock();
    s.setMuted(!s.muted);
    setMuted(s.muted);
  };

  // Relative drag: the hero follows the finger's sideways movement, never sits under it.
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const run = runRef.current;
    if (phaseRef.current !== 'playing' || !run) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, hx: run.core.x };
    ctl.current.target = Math.round(run.core.x);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const L = layoutRef.current;
    const r = e.currentTarget.getBoundingClientRect();
    const perWorld = (r.width / L.W) * L.k;
    // 1:1 with the finger: one lane (180 units) is a short, deliberate swipe.
    ctl.current.target = Math.round(clamp(d.hx + (e.clientX - d.x0) / perWorld, 0, SW));
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    ctl.current.target = -1;
  };
  const hold = (k: 'dive' | 'brake') => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      ctl.current[k] = true;
    },
    onPointerUp: () => {
      ctl.current[k] = false;
    },
    onPointerCancel: () => {
      ctl.current[k] = false;
    },
    onLostPointerCapture: () => {
      ctl.current[k] = false;
    },
  });

  const share = async () => {
    if (!finished) return;
    const text = `${shareText(finished)}\n${window.location.origin}/freefall`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* cancelled */
    }
  };

  const L = portrait ? PORTRAIT : LANDSCAPE;
  const rankedHere = ranked[level];
  const overlay =
    'absolute inset-0 z-20 flex flex-col items-center justify-[safe_center] gap-3 overflow-y-auto bg-bg/85 p-4 lg:pb-16 text-center backdrop-blur-[2px]';

  return (
    <section aria-label="Freefall: Math Dive" className="w-full">
      <div className="ff-box relative mx-auto" data-portrait={portrait ? '' : undefined}>
        <div
          ref={boxRef}
          className="panel relative w-full overflow-hidden"
          style={{ aspectRatio: `${L.W} / ${L.H}`, touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Freefall: your hero diving down a collapsing tower"
            tabIndex={-1}
            className="absolute inset-0 block h-full w-full select-none outline-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        {phase === 'playing' && (
          <div className="mt-2 flex items-stretch justify-between gap-2 touchland:contents">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="btn hidden min-h-14 flex-1 select-none coarse:flex touchland:fixed touchland:bottom-4 touchland:left-3 touchland:z-30 touchland:h-28 touchland:w-20 touchland:justify-center"
              {...hold('brake')}
            >
              Brake
            </button>
            <div className="flex gap-2 touchport:absolute touchport:right-2 touchport:bottom-[4.5rem] touchport:z-30 touchland:fixed touchland:top-3 touchland:right-3 touchland:z-30 touchland:flex-col">
              <button
                type="button"
                className="btn btn-sm min-h-11 min-w-11"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              >
                {muted ? 'Muted' : 'Sound'}
              </button>
              <button
                type="button"
                className="btn btn-sm min-h-11 min-w-11"
                onClick={() => {
                  go('paused');
                  setLive('Paused');
                }}
              >
                Pause
              </button>
            </div>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="btn btn-c1 hidden min-h-14 flex-1 select-none coarse:flex touchland:fixed touchland:right-3 touchland:bottom-4 touchland:z-30 touchland:h-28 touchland:w-20 touchland:justify-center"
              {...hold('dive')}
            >
              Dive
            </button>
          </div>
        )}

        {phase === 'start' && hero && (
          <div className={overlay}>
            <p className="kicker">
              {mode === 'daily' ? `Today's dive · ${day}` : 'Practice · a fresh tower every time'}
            </p>
            <h2 className="h-display ink-text text-5xl text-c3 sm:text-6xl cramped:text-4xl">
              {mode === 'daily' ? "Today's tower" : 'Practice tower'}
            </h2>
            <p className="max-w-prose text-sm">
              The tower is coming down. Fly through the opening with the right answer, dodge the
              rubble, catch the people falling with you.
            </p>
            <div className="flex flex-wrap justify-center gap-3 coarse:-order-1">
              <button
                ref={primaryRef as React.Ref<HTMLButtonElement>}
                type="button"
                className="btn btn-c1 text-lg"
                onClick={() => void start()}
                disabled={busy}
              >
                {busy ? 'Getting ready…' : 'Start the dive'}
              </button>
            </div>
            <Choices
              label="Run"
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                ['daily', "Today's dive (ranked)"],
                ['practice', 'Practice'],
              ]}
            />
            <Choices
              label="Maths"
              value={level}
              onChange={(v) => setLevel(v as Level)}
              options={LEVELS.map((l) => [l, LEVEL_LABEL[l]])}
            />
            <Choices
              label="Hero"
              value={heroSlug}
              onChange={setHeroSlug}
              options={heroes.map((h) => [h.slug, h.alias])}
            />
            {mode === 'daily' && signedIn && rankedHere === undefined && !(started[level] ?? 0) && (
              <p className="text-muted text-xs">
                One ranked start a day per class — closing the tab mid-dive uses it up.
              </p>
            )}
            {mode === 'daily' && rankedHere === undefined && (started[level] ?? 0) > 0 && (
              <p className="bubble max-w-sm text-sm">
                You've already started today's {LEVEL_LABEL[level]} tower here, so another go won't
                rank. Try Practice or another class.
              </p>
            )}
            {mode === 'daily' && rankedHere !== undefined && (
              <p className="bubble max-w-sm text-sm">
                You posted {rankedHere.toLocaleString('en-IN')} on today's {LEVEL_LABEL[level]}{' '}
                dive. Another go is for fun — only the first run counts.
              </p>
            )}
            {!signedIn &&
              (mode === 'daily' ? (
                <p className="bubble max-w-sm text-sm">
                  As a guest this is a free look at today's tower.{' '}
                  <Link to="/join?next=/freefall" className="underline">
                    Pick a nickname
                  </Link>{' '}
                  first (no email) to rank it — only your first dive counts.
                </p>
              ) : (
                <p className="text-muted text-sm">
                  Playing as a guest. Sign in when you finish to put your score on the board.
                </p>
              ))}
            <p className="text-muted text-xs coarse:hidden">
              ←/→ or A/D steer · 1/2/3 jump to a lane · ↓ dive (faster, more points) · ↑ brake · Esc
              pause
            </p>
            <p className="hidden text-muted text-xs coarse:block">
              Drag anywhere to steer. Hold Dive to fall faster for bonus points, Brake to buy
              thinking time.
            </p>
          </div>
        )}

        {phase === 'paused' && (
          <div className={overlay}>
            <h2 className="h-display ink-text text-5xl text-c3">Paused</h2>
            {mode === 'daily' && tokenRef.current.attempt === 1 && (
              <p className="text-muted text-sm">
                Pauses are counted: a ranked dive paused more than 6 times gets a quick check before
                it goes on the board.
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <button
                ref={primaryRef as React.Ref<HTMLButtonElement>}
                type="button"
                className="btn btn-c1"
                onClick={() => {
                  go('playing');
                  setLive('Resumed');
                }}
              >
                Resume
              </button>
              {/* Restarting today's tower would use up the ranked first start: restart as practice. */}
              <button
                type="button"
                className="btn"
                onClick={() => void start(mode === 'daily' ? 'practice' : mode)}
              >
                {mode === 'daily' ? 'Restart as practice' : 'Restart'}
              </button>
              <button type="button" className="btn" onClick={toggleMute} aria-pressed={muted}>
                {muted ? 'Sound off' : 'Sound on'}
              </button>
            </div>
          </div>
        )}

        {phase === 'over' && finished && (
          <div className={overlay}>
            <p className="kicker">
              {finished.mode === 'daily'
                ? `Today's dive · ${LEVEL_LABEL[finished.level]}`
                : `Practice · ${LEVEL_LABEL[finished.level]}`}
            </p>
            {/* Russo One digits: in the condensed display face a 7 reads as a 1. */}
            <h2 className="ink-text font-head text-5xl text-c3 sm:text-6xl cramped:text-4xl">
              {finished.summary.score.toLocaleString('en-IN')}
            </h2>
            <p className="h-head text-base">
              Floor {finished.summary.floors} · {finished.summary.correct}/{finished.summary.asked}{' '}
              sums · best streak {finished.summary.best} · {finished.summary.saved} saved
            </p>
            <p className="text-sm">{endLine(finished.summary)}</p>
            <PostLine
              finished={finished}
              posted={posted}
              signedIn={signedIn}
              onRetry={() => send(finished)}
            />
            <div className="flex flex-wrap justify-center gap-3">
              {canPostLater(finished, signedIn) && (
                <Link
                  ref={primaryRef as React.Ref<HTMLAnchorElement>}
                  to="/join?next=/freefall%3Fpost%3D1"
                  className="btn btn-c1"
                >
                  Join to post it
                </Link>
              )}
              <button
                ref={
                  canPostLater(finished, signedIn)
                    ? undefined
                    : (primaryRef as React.Ref<HTMLButtonElement>)
                }
                type="button"
                className={canPostLater(finished, signedIn) ? 'btn' : 'btn btn-c1'}
                onClick={() => void start('practice')}
                disabled={busy}
              >
                {finished.mode === 'daily' ? 'Practice dive' : 'Dive again'}
              </button>
              <button type="button" className="btn" onClick={() => void share()}>
                {copied ? 'Copied!' : 'Share'}
              </button>
              <button type="button" className="btn" onClick={() => go('start')}>
                Change level
              </button>
              <a href="#board" className="btn">
                Leaderboard
              </a>
            </div>
            {finished.misses.length > 0 && (
              <div className="panel max-w-md px-4 py-3 text-left">
                <p className="kicker mb-1">Sums to practise</p>
                <ul className="space-y-0.5 text-sm">
                  {finished.misses.slice(0, 6).map((m, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a run can miss the same sum twice.
                    <li key={i}>
                      {/* Russo One, a size up: at 14 px the body face's ÷ reads as +. */}
                      <b className="font-head text-base">
                        {/* "? + 10 = 18 → ? = 8": keep which number was missing. */}
                        {m.text.includes('?')
                          ? `${m.text} → ? = ${fmt(m.answer)}`
                          : `${m.text} = ${fmt(m.answer)}`}
                      </b>{' '}
                      <span className="text-muted">
                        {m.picked === null
                          ? '(you hit the wall)'
                          : `(you flew into ${fmt(m.picked)})`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="w-24 overflow-hidden rounded border-3 border-line [@media(max-height:560px)]:hidden">
              <SpriteClip
                fighter={heroes.find((h) => h.slug === finished.hero) ?? (hero as Fighter)}
                pose={finished.summary.correct >= finished.summary.asked / 2 ? 'victory' : 'hurt'}
                autoPlay
              />
            </div>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </p>
      <p className="sr-only">{desc}</p>
    </section>
  );
}

/** Why the run ended, and a word on how it went. */
function endLine(s: Summary): string {
  const acc = s.asked ? s.correct / s.asked : 0;
  const why =
    s.cause === 'rubble'
      ? `Rubble took your last heart (${s.hits} ${s.hits === 1 ? 'hit' : 'hits'} this run).`
      : s.cause === 'wall'
        ? 'The slab caught you between two openings — line up a little earlier.'
        : s.cause === 'ground'
          ? 'You reached the bottom of the tower. Legend.'
          : 'A wrong opening took your last heart.';
  const word =
    s.asked < 3
      ? 'Short one — try again!'
      : acc >= 0.9
        ? 'Maths machine!'
        : acc >= 0.7
          ? 'Solid dive.'
          : 'Those sums bit back — the list below helps.';
  return `${why} ${word}`;
}

/** A guest's run that will post once they sign in. */
const canPostLater = (f: Finished, signedIn: boolean) =>
  !signedIn && !!f.token && f.mode === 'practice';

function Choices({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <fieldset className="flex max-w-xl flex-wrap items-center justify-center gap-2">
      <legend className="sr-only">{label}</legend>
      <span className="kicker" aria-hidden>
        {label}
      </span>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          className="chip min-h-11"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </fieldset>
  );
}

function PostLine({
  finished,
  posted,
  signedIn,
  onRetry,
}: {
  finished: Finished;
  posted: Posted | null;
  signedIn: boolean;
  onRetry: () => void;
}) {
  if (!finished.token)
    return <p className="text-muted text-sm">Offline run — not posted to the board.</p>;
  if (finished.mode === 'daily' && finished.attempt === 0)
    return (
      <p className="bubble max-w-md text-sm">
        A guest's look at today's tower doesn't rank.{' '}
        <Link to="/join?next=/freefall" className="underline">
          Pick a nickname
        </Link>{' '}
        before your next dive — your first ranked run is still waiting.
      </p>
    );
  if (finished.mode === 'daily' && finished.attempt > 1)
    return (
      <p className="text-muted text-sm">
        A replay of today's tower — only your first go ranks. Practice runs count for all-time.
      </p>
    );
  if (!signedIn)
    return (
      <p className="bubble max-w-md text-sm">
        <Link to="/login?next=/freefall%3Fpost%3D1" className="underline">
          Sign in
        </Link>{' '}
        or{' '}
        <Link to="/join?next=/freefall%3Fpost%3D1" className="underline">
          join free
        </Link>{' '}
        to put this score on {finished.mode === 'daily' ? "today's" : 'the all-time'} board — we'll
        keep it for you.
      </p>
    );
  if (!posted) return <p className="text-muted text-sm">Checking your run…</p>;
  if (!posted.ok)
    return (
      <p className="text-sm text-c1-text">
        {posted.error ?? 'Could not post.'}{' '}
        {posted.error?.startsWith('Network') && (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Retry
          </button>
        )}
      </p>
    );
  if (posted.stored === false)
    return (
      <p className="text-muted text-sm">
        {posted.reason === 'not-first'
          ? "A replay of today's tower — only your first go ranks."
          : `You'd already posted today's ${LEVEL_LABEL[finished.level]} dive — this one was for fun.`}
      </p>
    );
  if (posted.pending)
    return (
      <p className="bubble max-w-md text-sm">
        Verified
        {posted.best === false
          ? ` (this run: ${finished.summary.score.toLocaleString('en-IN')})`
          : ''}{' '}
        — {posted.best === false ? 'your best is' : "you're"} <b>#{posted.rank}</b>
        {finished.mode === 'daily' ? ' today' : ' all-time'}! It's already in its place; a run this
        big gets a moderator's quick look before your name shows there.
      </p>
    );
  if (posted.review)
    return (
      <p className="bubble max-w-md text-sm">
        Verified and in its place on the board — without your name until a moderator has taken a
        quick look.
      </p>
    );
  return (
    <p className="bubble max-w-md text-sm">
      {finished.mode === 'daily' ? (
        <>
          Verified and posted: <b>#{posted.rank}</b> of {posted.of} today.
        </>
      ) : (
        <>
          Verified and posted
          {posted.best === false
            ? ` (this run: ${finished.summary.score.toLocaleString('en-IN')})`
            : ''}
          . Your best ranks <b>#{posted.rank}</b> of {posted.of} all-time.
        </>
      )}
    </p>
  );
}
