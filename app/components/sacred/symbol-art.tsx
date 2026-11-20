/**
 * Animated generic motifs for Sacred India cards (S4: never a face, a deity or a traced emblem).
 * Each motif is a few plain strokes on a 100x100 board. They draw themselves on slowly, then a soft
 * light breathes behind them. All motion is CSS (see "Sacred realm" in app.css), so reduced motion
 * stills it at the finished drawing.
 */
import type { SacredSymbol } from '~/lib/sacred-taxonomy';

const TAU = Math.PI * 2;
const f = (n: number) => Number(n.toFixed(2));
const pt = (cx: number, cy: number, r: number, a: number) =>
  `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;
const rays = (n: number, r1: number, r2: number, cx = 50, cy = 50, off = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = off + (i / n) * TAU;
    return `M${pt(cx, cy, r1, a)} L${pt(cx, cy, r2, a)}`;
  });
const starPath = (points: number, rOut: number, rIn: number) =>
  `${Array.from({ length: points * 2 }, (_, i) => {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    return `${i ? 'L' : 'M'}${pt(50, 50, i % 2 ? rIn : rOut, a)}`;
  }).join(' ')}Z`;

const wave = (y: number) => `M8 ${y} C20 ${y - 12} 32 ${y - 12} 44 ${y} S68 ${y + 12} 92 ${y}`;

/** Strokes per motif, drawn in order. */
export const MOTIFS: Record<SacredSymbol, string[]> = {
  lotus: [
    'M50 22 C63 38 63 58 50 74 C37 58 37 38 50 22Z',
    'M50 74 C34 68 22 52 22 36 C38 40 48 54 50 74Z',
    'M50 74 C66 68 78 52 78 36 C62 40 52 54 50 74Z',
    'M50 74 C28 76 12 64 8 50 C26 50 42 58 50 74Z',
    'M50 74 C72 76 88 64 92 50 C74 50 58 58 50 74Z',
    'M22 86 C38 92 62 92 78 86',
  ],
  flame: [
    'M50 12 C58 30 76 40 74 62 C72 80 60 88 50 88 C40 88 28 80 26 62 C25 48 36 44 40 32 C44 38 46 40 50 12Z',
    'M50 50 C56 60 62 66 58 76 C56 82 44 82 42 76 C40 68 46 62 50 50Z',
  ],
  sun: [circle(50, 50, 15), ...rays(12, 24, 38), circle(50, 50, 21)],
  moon: [
    'M62 14 C40 16 26 34 26 54 C26 74 42 88 62 86 C48 78 42 66 44 52 C46 38 52 26 62 14Z',
    'M76 28 L76 38 M71 33 L81 33',
    'M82 60 L82 66 M79 63 L85 63',
  ],
  wave: [wave(36), wave(52), wave(68), 'M20 84 C36 90 64 90 80 84'],
  mountain: [
    'M6 82 L34 36 L50 60 L64 42 L94 82Z',
    'M34 36 L27 48 L34 45 L40 50',
    'M64 42 L58 51 L64 49 L70 53',
    circle(78, 20, 6),
  ],
  wheel: [circle(50, 50, 36), circle(50, 50, 28), circle(50, 50, 6), ...rays(12, 6, 28)],
  conch: [
    'M72 30 C62 16 38 16 28 32 C20 46 26 68 44 74 C60 80 74 68 72 54 C70 44 60 38 50 42 C42 46 44 56 52 58',
    'M72 30 C78 26 84 26 86 30 C84 38 78 42 72 44',
    'M32 70 C28 78 24 82 18 84',
  ],
  flute: [
    'M12 80 L80 20 L88 28 L20 88Z',
    circle(34, 66, 2.2),
    circle(44, 57, 2.2),
    circle(54, 48, 2.2),
    circle(64, 39, 2.2),
    'M78 16 C84 8 92 10 94 16',
  ],
  bow: ['M30 10 C84 30 84 70 30 90', 'M30 10 L30 90', 'M16 50 L88 50 M80 44 L88 50 L80 56'],
  mace: [
    'M50 10 C66 10 74 26 66 38 C62 46 38 46 34 38 C26 26 34 10 50 10Z',
    'M50 46 L50 88',
    'M42 90 L58 90',
    'M36 24 L64 24 M38 34 L62 34',
  ],
  tree: [
    'M50 90 L50 56 M50 74 L36 62 M50 68 L64 56',
    'M50 56 C20 60 12 30 34 24 C38 6 66 6 68 24 C90 28 82 58 50 56Z',
    'M34 90 L66 90',
  ],
  lamp: [
    'M12 56 C20 82 80 82 88 56Z',
    'M50 18 C58 30 64 38 58 48 C56 52 44 52 42 48 C36 38 44 30 50 18Z',
    'M36 86 L64 86',
    'M88 56 C92 52 94 50 96 46',
  ],
  feather: [
    'M22 90 C28 50 52 24 84 12 C80 44 56 76 22 90Z',
    'M22 90 L72 30',
    'M40 66 L56 70 M48 54 L64 56 M58 44 L72 44 M34 76 L46 82',
  ],
  serpent: [
    'M20 84 C16 62 52 72 56 52 C60 32 28 38 38 22 C44 12 62 14 66 24',
    'M66 24 L76 24 M76 24 L82 19 M76 24 L82 29',
    'M14 90 L26 90',
  ],
  book: [
    'M50 28 C38 20 22 20 12 24 L12 76 C22 72 38 72 50 80 C62 72 78 72 88 76 L88 24 C78 20 62 20 50 28Z',
    'M50 28 L50 80',
    'M20 34 L42 36 M20 44 L42 46 M20 54 L42 56 M58 36 L80 34 M58 46 L80 44 M58 56 L80 54',
  ],
  star: [starPath(8, 40, 22), circle(50, 50, 6)],
  drum: [
    'M24 30 a26 9 0 1 0 52 0 a26 9 0 1 0 -52 0',
    'M24 30 L29 70 M76 30 L71 70',
    'M29 70 C29 86 71 86 71 70',
    'M30 38 L40 78 L50 42 L60 78 L70 38',
  ],
  sword: [
    'M50 6 L58 62 L42 62Z',
    'M28 66 L72 66',
    'M50 66 L50 84',
    circle(50, 90, 4),
    'M50 14 L50 56',
  ],
  footprint: [
    'M42 86 C28 86 26 66 32 52 C36 42 50 40 56 48 C62 58 60 86 42 86Z',
    circle(30, 36, 4),
    circle(40, 30, 4),
    circle(51, 30, 4),
    circle(61, 36, 4),
    circle(68, 46, 3.5),
  ],
};

export function SymbolArt({
  symbol,
  c1,
  c2,
  live = true,
  label,
  className = '',
}: {
  symbol: SacredSymbol;
  c1: string;
  c2: string;
  /** Breathing light runs always (hero) or only on hover/focus (card grids, cheaper). */
  live?: boolean;
  label?: string;
  className?: string;
}) {
  const strokes = MOTIFS[symbol];
  return (
    <svg
      viewBox="0 0 100 100"
      className={`sym ${live ? 'sym-live' : ''} ${className}`}
      style={{ '--sym-a': c1, '--sym-b': c2 } as React.CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle className="sym-halo sym-glow" cx="50" cy="50" r="42" />
      <g className="sym-strokes">
        {strokes.map((d) => (
          <path key={d} d={d} pathLength={1} className="sym-p" />
        ))}
      </g>
    </svg>
  );
}
