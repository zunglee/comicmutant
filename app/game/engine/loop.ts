/**
 * Fixed-timestep game loop: simulation at 60 Hz, rendering on requestAnimationFrame with the
 * interpolation remainder. Auto-pauses when the tab is hidden or the window loses focus.
 */
export const STEP = 1 / 60;

/** Pure accumulator step: how many fixed updates to run for a frame of `frameDt` seconds. */
export function advance(
  acc: number,
  frameDt: number,
  step = STEP,
  maxSteps = 5,
): { steps: number; acc: number } {
  let a = acc + Math.min(Math.max(frameDt, 0), 0.25);
  let steps = 0;
  while (a >= step && steps < maxSteps) {
    a -= step;
    steps++;
  }
  // Spiral-of-death guard: drop time we could not simulate.
  if (steps === maxSteps && a >= step) a = 0;
  return { steps, acc: a };
}

export interface LoopHooks {
  update: (dt: number) => void;
  render: (alpha: number) => void;
  /** Called when the loop pauses itself (tab hidden / window blurred). */
  onAutoPause?: () => void;
}

export interface Loop {
  start(): void;
  /** Stop animating: paint one more frame (for overlays that just changed) and release rAF. */
  sleep(): void;
  /** Resume animating after sleep(). */
  wake(): void;
  readonly sleeping: boolean;
  stop(): void;
  setPaused(p: boolean): void;
  readonly paused: boolean;
  destroy(): void;
}

export function createLoop(h: LoopHooks): Loop {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let paused = false;
  let running = false;
  let sleeping = false;
  const frame = (now: number) => {
    if (sleeping) {
      raf = 0;
      h.render(0);
      return;
    }
    raf = requestAnimationFrame(frame);
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (!paused) {
      const r = advance(acc, dt);
      acc = r.acc;
      for (let i = 0; i < r.steps; i++) h.update(STEP);
    }
    h.render(paused ? 0 : acc / STEP);
  };
  const autoPause = () => {
    if (running && !paused) {
      paused = true;
      h.onAutoPause?.();
    }
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') autoPause();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', autoPause);
  return {
    start() {
      if (raf) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    sleep() {
      sleeping = true;
      if (running && !raf) raf = requestAnimationFrame(frame);
    },
    wake() {
      if (!sleeping) return;
      sleeping = false;
      last = 0;
      acc = 0;
      if (running && !raf) raf = requestAnimationFrame(frame);
    },
    get sleeping() {
      return sleeping;
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    setPaused(p) {
      paused = p;
      last = 0;
      acc = 0;
    },
    get paused() {
      return paused;
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      running = false;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', autoPause);
    },
  };
}
