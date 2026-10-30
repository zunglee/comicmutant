/**
 * One canvas "GIF". Every clip on the site — motif clips for characters, sprite clips for
 * originals — renders through this component so they share one requestAnimationFrame loop,
 * pause off screen, cap device-pixel-ratio, and obey Lite mode / reduced motion.
 *
 * `draw(ctx, t, w, h)` must be pure for a given `t` (seconds): the loop can skip frames, the
 * still frame uses t = `still`, and "Save clip" records the same function to WebM.
 */
import { useEffect, useRef, useState } from 'react';
import { useAnimate } from '~/lib/fx';

export type DrawFn = (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => void;

interface Entry {
  canvas: HTMLCanvasElement;
  draw: DrawFn;
  start: number;
  visible: boolean;
  /** Fraction of the clip on screen; the most visible clips win the live slots. */
  ratio: number;
  playing: boolean;
  still: number;
  /** A still frame is on the canvas (so an over-cap clip is never blank). */
  painted: boolean;
}

/** Shared scheduler: one rAF for every clip on the page, at most MAX_LIVE animating at once. */
const MAX_LIVE = 14;
/** Clips are GIF-like: 30 fps is plenty and halves raster work on 60–120 Hz screens. */
const FRAME_MS = 1000 / 30;
const entries = new Set<Entry>();
let raf = 0;
let lastDraw = 0;
/** Animation waits for page load + an idle slot, so clips never compete with LCP or hydration. */
let ready = false;

if (typeof window !== 'undefined') {
  const go = () => {
    const idle = (
      window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => number }
    ).requestIdleCallback;
    const start = () => {
      ready = true;
      wake();
    };
    if (idle) idle(start, { timeout: 1500 });
    else setTimeout(start, 200);
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

function frame(now: number) {
  raf = 0;
  if (now - lastDraw < FRAME_MS - 2) {
    raf = requestAnimationFrame(frame);
    return;
  }
  lastDraw = now;
  const wanted = [...entries]
    .filter((e) => e.visible && e.playing)
    .sort((a, b) => b.ratio - a.ratio);
  for (const [i, e] of wanted.entries()) {
    if (i >= MAX_LIVE) {
      // Over the cap: hold a still frame rather than leave the canvas blank.
      if (!e.painted) paintStill(e);
      continue;
    }
    const ctx = e.canvas.getContext('2d');
    if (!ctx) continue;
    const dpr = Number(e.canvas.dataset.dpr) || 1;
    const w = e.canvas.width / dpr;
    const h = e.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    e.draw(ctx, (now - e.start) / 1000, w, h);
    e.painted = false;
  }
  if (wanted.length > 0) raf = requestAnimationFrame(frame);
}

function wake() {
  if (ready && !raf && typeof requestAnimationFrame !== 'undefined')
    raf = requestAnimationFrame(frame);
}

function paintStill(e: Pick<Entry, 'canvas' | 'draw' | 'still'> & { painted?: boolean }) {
  const ctx = e.canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Number(e.canvas.dataset.dpr) || 1;
  const w = e.canvas.width / dpr;
  const h = e.canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  e.draw(ctx, e.still, w, h);
  e.painted = true;
}

export interface ClipCanvasProps {
  draw: DrawFn;
  label: string;
  /** width / height */
  aspect?: number;
  /** Seconds into the loop used for the still frame (Lite mode, reduced motion, SSR fallback). */
  still?: number;
  className?: string;
  /** Force animation even in Lite mode (e.g. the clip a user just tapped). */
  autoPlay?: boolean;
  /** Seconds recorded by "Save clip". */
  loop?: number;
  saveName?: string;
  /**
   * Inside another control (a card link or button): hidden from assistive tech and never adds its
   * own play button, so the parent stays the single interactive element.
   */
  decorative?: boolean;
  /**
   * Grid cards: animate only while the card (closest link/button) is hovered or focused, so a
   * page of 30 cards doesn't keep 14 canvases live. Still frame otherwise.
   */
  hoverPlay?: boolean;
}

export function ClipCanvas({
  draw,
  label,
  aspect = 1,
  still = 0.8,
  className = '',
  autoPlay,
  loop = 3,
  saveName,
  decorative = false,
  hoverPlay = false,
}: ClipCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const entry = useRef<Entry | null>(null);
  const animate = useAnimate();
  const [tapped, setTapped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [recording, setRecording] = useState(false);
  const playing = (animate && (!hoverPlay || hovered)) || tapped || !!autoPlay;

  useEffect(() => {
    if (!hoverPlay) return;
    const host = ref.current?.closest('a,button') ?? ref.current?.parentElement;
    if (!host) return;
    const on = () => setHovered(true);
    const off = () => setHovered(false);
    host.addEventListener('pointerenter', on);
    host.addEventListener('pointerleave', off);
    host.addEventListener('focusin', on);
    host.addEventListener('focusout', off);
    return () => {
      host.removeEventListener('pointerenter', on);
      host.removeEventListener('pointerleave', off);
      host.removeEventListener('focusin', on);
      host.removeEventListener('focusout', off);
    };
  }, [hoverPlay]);

  // Size the backing store to the element (DPR capped at 2 — clips are decorative).
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.max(1, Math.round(r.width * dpr));
      const ch = Math.max(1, Math.round(r.height * dpr));
      // Assigning width clears the canvas even when unchanged: only touch it on a real resize.
      if (cw === canvas.width && ch === canvas.height && canvas.dataset.dpr === String(dpr)) return;
      canvas.width = cw;
      canvas.height = ch;
      canvas.dataset.dpr = String(dpr);
      // Repaint after a real resize (the first paint belongs to the entry effect below).
      if (entry.current) {
        paintStill(entry.current);
        if (entry.current.playing) wake();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const e: Entry = {
      canvas,
      draw,
      start: performance.now(),
      visible: false,
      ratio: 0,
      playing,
      still,
      painted: false,
    };
    entry.current = e;
    entries.add(e);
    const io = new IntersectionObserver(
      ([hit]) => {
        e.visible = !!hit?.isIntersecting;
        e.ratio = hit?.intersectionRatio ?? 0;
        if (e.visible && e.playing) wake();
      },
      { rootMargin: '120px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    io.observe(canvas);
    paintStill(e);
    return () => {
      io.disconnect();
      entries.delete(e);
    };
  }, [draw, playing, still]);

  async function save() {
    const canvas = ref.current;
    if (!canvas || recording || typeof MediaRecorder === 'undefined') return;
    setRecording(true);
    try {
      const off = document.createElement('canvas');
      off.width = 480;
      off.height = Math.round(480 / aspect);
      const ctx = off.getContext('2d');
      if (!ctx) return;
      const stream = off.captureStream(30);
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: type });
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => chunks.push(ev.data);
      const done = new Promise<void>((r) => {
        rec.onstop = () => r();
      });
      rec.start();
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          const t = (now - t0) / 1000;
          ctx.clearRect(0, 0, off.width, off.height);
          draw(ctx, t, off.width, off.height);
          if (t < loop) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      rec.stop();
      await done;
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${saveName ?? 'comicmutant-clip'}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally {
      setRecording(false);
    }
  }

  return (
    <figure className={`group relative ${className}`} style={{ aspectRatio: String(aspect) }}>
      {decorative ? (
        <canvas ref={ref} aria-hidden className="block h-full w-full" />
      ) : (
        <canvas ref={ref} role="img" aria-label={label} className="block h-full w-full" />
      )}
      {!animate && !autoPlay && !decorative && (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer"
          aria-label={tapped ? `Pause ${label}` : `Play ${label}`}
          aria-pressed={tapped}
          onClick={() => setTapped((v) => !v)}
        />
      )}
      {saveName && !decorative && (
        <button
          type="button"
          onClick={save}
          disabled={recording}
          className="btn btn-sm absolute right-2 bottom-2 group-hover:bg-c3 group-hover:text-on-c3 focus-visible:bg-c3 focus-visible:text-on-c3"
        >
          {recording ? 'Saving…' : 'Save clip'}
        </button>
      )}
    </figure>
  );
}
