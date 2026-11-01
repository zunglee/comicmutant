/**
 * The brag card: a comic-style PNG drawn on a canvas (no libraries), plus Share / Download / Copy.
 * Colours come from the page's theme variables, so the card matches the site the fan was playing on.
 */
import { useEffect, useRef, useState } from 'react';
import type { QuizSummary } from '~/lib/quiz-contract';
import { fmt } from './daily';
import { parseGrid } from './grid';
import { IconCopy, IconDownload, IconShare } from './qicons';

const W = 1080;
const H = 1400;

interface CardInput {
  label: string;
  dateLabel: string;
  summary: QuizSummary;
  host: string;
}

function vars() {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
  return {
    bg: v('--bg', '#12101a'),
    fg: v('--fg', '#f6f1e7'),
    c1: v('--c1', '#ff2e4d'),
    c2: v('--c2', '#1b1464'),
    c3: v('--c3', '#ffd400'),
    onC1: v('--on-c1', '#0d0b10'),
    onC3: v('--on-c3', '#0d0b10'),
    ink: '#0d0b10',
    ok: '#8de969',
    bad: '#ff8a8a',
    warn: '#ffd400',
  };
}

function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r1: number,
  r2: number,
  n: number,
) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / n - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Draws the card onto `cv`, `scale` times its 1080x1400 design size. */
function paint(cv: HTMLCanvasElement, scale: number, inp: CardInput): boolean {
  cv.width = Math.round(W * scale);
  cv.height = Math.round(H * scale);
  const ctx = cv.getContext('2d');
  if (!ctx) return false;
  ctx.scale(scale, scale);
  const c = vars();
  const display = 'Bangers, Impact, system-ui, sans-serif';
  const head = '"Russo One", "Arial Black", system-ui, sans-serif';
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Paper: flat colour + halftone dots (one small tile, repeated: far cheaper than 1,400 arcs).
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  const tile = document.createElement('canvas');
  tile.width = 34;
  tile.height = 68;
  const tc = tile.getContext('2d');
  if (tc) {
    tc.fillStyle = c.c1;
    tc.globalAlpha = 0.22;
    for (const [x, y] of [
      [0, 0],
      [34, 0],
      [17, 34],
      [0, 68],
      [34, 68],
    ] as const) {
      tc.beginPath();
      tc.arc(x, y, 6, 0, Math.PI * 2);
      tc.fill();
    }
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Title band.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-20, 40);
  ctx.lineTo(W + 20, 0);
  ctx.lineTo(W + 20, 400);
  ctx.lineTo(-20, 430);
  ctx.closePath();
  ctx.fillStyle = c.c1;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = c.ink;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(W / 2, 215);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.font = `210px ${display}`;
  ctx.lineWidth = 26;
  ctx.strokeStyle = c.ink;
  ctx.strokeText('FACT FRENZY', 8, 10);
  ctx.fillStyle = c.ink;
  ctx.fillText('FACT FRENZY', 10, 12);
  ctx.strokeText('FACT FRENZY', 0, 0);
  ctx.fillStyle = c.c3;
  ctx.fillText('FACT FRENZY', 0, 0);
  ctx.restore();

  // Mode label pill.
  ctx.font = `46px ${head}`;
  const label = inp.label.toUpperCase();
  const lw = Math.min(ctx.measureText(label).width + 90, W - 120);
  box(ctx, (W - lw) / 2, 452, lw, 86, 43);
  ctx.fillStyle = '#fffdf6';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = c.ink;
  ctx.stroke();
  ctx.fillStyle = c.ink;
  ctx.fillText(label, W / 2, 497, lw - 50);

  // Score burst.
  star(ctx, W / 2, 865, 305, 228, 14);
  ctx.fillStyle = c.ink;
  ctx.save();
  ctx.translate(12, 14);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = c.c3;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = c.ink;
  ctx.stroke();
  ctx.fillStyle = c.onC3;
  if (inp.summary.blind) {
    // Blind daily: the score and the answers stay secret until midnight IST.
    ctx.font = `140px ${display}`;
    ctx.fillText('LOCKED', W / 2, 765, 440);
    ctx.fillText('IN!', W / 2, 880, 440);
    ctx.font = `44px ${head}`;
    ctx.fillText(`${inp.summary.total} ANSWERS`, W / 2, 985, 330);
    ctx.font = `56px ${display}`;
    ctx.lineWidth = 12;
    ctx.strokeStyle = c.ink;
    ctx.strokeText('BLIND PRACTICE · NO SCORE', W / 2, 1230, W - 120);
    ctx.fillStyle = c.fg;
    ctx.fillText('BLIND PRACTICE · NO SCORE', W / 2, 1230, W - 120);
    ctx.font = `38px ${head}`;
    ctx.fillStyle = c.fg;
    ctx.fillText(
      `${inp.dateLabel.toUpperCase()}  ·  ${inp.host.toUpperCase()}`,
      W / 2,
      1360,
      W - 80,
    );
    return true;
  }
  ctx.font = `54px ${head}`;
  ctx.fillText('SCORE', W / 2, 722);
  ctx.font = `250px ${display}`;
  ctx.fillText(fmt(inp.summary.score), W / 2, 868, 440);
  ctx.font = `56px ${head}`;
  ctx.fillText(`${inp.summary.correct}/${inp.summary.total} RIGHT`, W / 2, 1010);

  // Streak line.
  ctx.font = `76px ${display}`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = c.ink;
  // A held run is waiting for a moderator: it carries that mark instead of a streak brag.
  const streak = inp.summary.held
    ? 'PENDING A MOD CHECK'
    : `BEST STREAK x${inp.summary.bestStreak}`;
  ctx.strokeText(streak, W / 2, 1205);
  ctx.fillStyle = c.fg;
  ctx.fillText(streak, W / 2, 1205);

  // Answer grid.
  const cells = parseGrid(inp.summary.grid);
  const n = Math.max(cells.length, 1);
  const gap = 12;
  const size = Math.min(88, (W - 120 - gap * (n - 1)) / n);
  const x0 = (W - (size * n + gap * (n - 1))) / 2;
  cells.forEach((k, i) => {
    const x = x0 + i * (size + gap);
    const y = 1240;
    box(ctx, x, y, size, size, 12);
    ctx.fillStyle = k === 'ok' ? c.ok : k === 'bad' ? c.bad : c.warn;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = c.ink;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    const m = size / 2;
    ctx.beginPath();
    if (k === 'ok') {
      ctx.moveTo(x + m * 0.55, y + m * 1.05);
      ctx.lineTo(x + m * 0.9, y + m * 1.4);
      ctx.lineTo(x + m * 1.5, y + m * 0.65);
    } else if (k === 'bad') {
      ctx.moveTo(x + m * 0.6, y + m * 0.6);
      ctx.lineTo(x + m * 1.4, y + m * 1.4);
      ctx.moveTo(x + m * 1.4, y + m * 0.6);
      ctx.lineTo(x + m * 0.6, y + m * 1.4);
    } else {
      ctx.arc(x + m, y + m, m * 0.5, 0, Math.PI * 2);
      ctx.moveTo(x + m, y + m * 0.7);
      ctx.lineTo(x + m, y + m);
      ctx.lineTo(x + m * 1.25, y + m * 1.15);
    }
    ctx.stroke();
  });

  // Footer.
  ctx.font = `38px ${head}`;
  ctx.fillStyle = c.fg;
  ctx.fillText(`${inp.dateLabel.toUpperCase()}  ·  ${inp.host.toUpperCase()}`, W / 2, 1360, W - 80);

  return true;
}

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('120px Bangers'),
      document.fonts.load('40px "Russo One"'),
    ]);
  } catch {
    /* fonts fall back to Impact / system */
  }
}

/** Full-size PNG, made only when the player taps Share or Download. */
async function cardBlob(inp: CardInput): Promise<Blob | null> {
  await fontsReady();
  const cv = document.createElement('canvas');
  if (!paint(cv, 1, inp)) return null;
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

export function SharePanel({
  label,
  dateLabel,
  summary,
  text,
  url,
}: {
  label: string;
  dateLabel: string;
  summary: QuizSummary;
  /** Plain-text share message (includes the quiz link). */
  text: string;
  url: string;
}) {
  const view = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const input = (): CardInput => ({ label, dateLabel, summary, host: window.location.host });

  // A small live preview, drawn when the browser is idle (the full PNG waits for a tap).
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn once per finished game.
  useEffect(() => {
    let dead = false;
    const draw = () => {
      void fontsReady().then(() => {
        if (!dead && view.current) paint(view.current, 0.4, input());
      });
    };
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(draw) : window.setTimeout(draw, 900);
    return () => {
      dead = true;
      if (!w.requestIdleCallback) window.clearTimeout(id);
    };
  }, [summary.grid, summary.score]);

  const share = async () => {
    setBusy(true);
    try {
      const blob = await cardBlob(input());
      if (blob && typeof navigator.canShare === 'function') {
        const file = new File([blob], 'fact-frenzy.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Fact Frenzy', text });
          return;
        }
      }
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Fact Frenzy', text, url });
        return;
      }
      await copy();
    } catch {
      /* the share sheet was closed */
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    const blob = await cardBlob(input());
    setBusy(false);
    if (!blob) {
      setNote('Your browser could not make the picture.');
      return;
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'fact-frenzy.png';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 5000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied! Paste it anywhere.');
    } catch {
      const ta = document.getElementById('qz-share') as HTMLTextAreaElement | null;
      ta?.focus();
      ta?.select();
      setNote('Copy blocked, text selected: press Ctrl/Cmd+C.');
    }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section aria-labelledby="qz-share-h" className="panel space-y-3 p-4">
      <h3 id="qz-share-h" className="h-head text-lg">
        Brag about it
      </h3>
      <div className="mx-auto aspect-[1080/1400] w-full max-w-[18rem] overflow-hidden rounded-md border-[3px] border-line bg-bg shadow-ink-sm">
        <canvas
          ref={view}
          role="img"
          aria-label={
            summary.blind
              ? `Result card: ${label}, ${summary.total} answers locked in, results unlock at midnight IST.`
              : `Result card: ${label}, score ${summary.score}${summary.held ? ' (pending a check)' : ''}, ${summary.correct} of ${summary.total} right, best streak ${summary.bestStreak}.`
          }
          className="h-full w-full"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-c3" onClick={share} disabled={busy}>
          <IconShare className="size-4" /> {canShare ? 'Share' : 'Copy to share'}
        </button>
        <button type="button" className="btn" onClick={download} disabled={busy}>
          <IconDownload className="size-4" /> Download
        </button>
        <button type="button" className="btn" onClick={copy}>
          <IconCopy className="size-4" /> Copy text
        </button>
        <span role="status" className="text-sm">
          {note}
        </span>
      </div>
      <textarea
        id="qz-share"
        readOnly
        rows={4}
        value={text}
        aria-label="Share text"
        className="field resize-none font-mono text-xs"
      />
    </section>
  );
}
