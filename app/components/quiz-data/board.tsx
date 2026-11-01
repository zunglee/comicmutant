/**
 * Leaderboard pieces: an animated top-3 podium and the ranked list. Ranks are the server's real ranks
 * (ties share a rank), never the array position, and the viewer's row is marked in words as well as colour.
 */
import { m } from 'motion/react';
import { useAnimate } from '~/lib/fx';
import type { BoardRow } from '~/lib/quiz-contract';
import { nf } from './format';

/** [singular, plural] of the value's unit, e.g. ['pt', 'pts']. */
export type Unit = readonly [string, string];
const unitOf = (u: Unit, n: number) => (n === 1 ? u[0] : u[1]);

/** What a row shows as its name: a withheld one waits for a mod's look (Q17), never says why in alarm. */
function Who({ r, block = false }: { r: BoardRow; block?: boolean }) {
  if (r.withheld && !r.you)
    return (
      <span className={block ? 'block' : undefined}>
        <span className="italic opacity-90">Name withheld</span>
        <span className="block font-normal text-xs opacity-80">awaiting a quick check</span>
      </span>
    );
  return (
    <span className={block ? 'block' : undefined}>
      {r.name}
      {r.you && <span className="ml-1 font-normal text-xs">(you)</span>}
      {r.withheld && r.you && (
        <span className="block font-normal text-xs opacity-80">shows after a quick check</span>
      )}
    </span>
  );
}

const PLACE = ['1st', '2nd', '3rd'] as const;
// Visual left-to-right order is 2nd · 1st · 3rd by position; the DOM stays in rank order for screen
// readers. A tie keeps its shared rank: the step height and place label follow the rank, not the position.
const COLUMN = ['order-2', 'order-1', 'order-3'] as const;
const STEP = ['h-28', 'h-20', 'h-14'] as const;
// Third place lands first, the winner last.
const DELAY = [0.32, 0.16, 0] as const;
const TIER_COLOUR = ['bg-c1 text-on-c1', 'bg-c3 text-on-c3', 'bg-c2 text-on-c2'] as const;

/** How many rows share each rank, so a tie can be said in words ("tied"), not just implied. */
function shareCounts(rows: BoardRow[]): Map<number, number> {
  const n = new Map<number, number>();
  for (const r of rows) n.set(r.rank, (n.get(r.rank) ?? 0) + 1);
  return n;
}

export function Podium({ rows, unit }: { rows: BoardRow[]; unit: Unit }) {
  const animate = useAnimate();
  const top = rows.slice(0, 3);
  const shared = shareCounts(rows);
  if (top.length === 0) return null;
  return (
    <ul
      aria-label="Top three"
      className="mx-auto mb-6 flex max-w-2xl items-end justify-center gap-2 sm:gap-4"
    >
      {top.map((r, i) => {
        const tier = Math.max(0, Math.min(2, r.rank - 1));
        const tied = r.tied || (shared.get(r.rank) ?? 0) > 1;
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: names can be withheld (empty), ranks repeat.
            key={i}
            className={`flex min-w-0 max-w-56 flex-1 flex-col items-stretch ${COLUMN[i]}`}
          >
            <m.div
              className={`panel mb-2 min-w-0 p-2 text-center sm:p-3 ${r.you ? 'bg-c3! text-on-c3!' : ''}`}
              initial={animate ? { y: -48, scale: 0.9 } : false}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: DELAY[i] }}
            >
              <p className="h-head text-xs uppercase tracking-wide">
                {PLACE[tier]}
                {tied && ' · tied'}
              </p>
              <p className="min-h-[2.6em] break-words font-bold text-sm leading-tight sm:text-base">
                <Who r={r} block />
              </p>
              <p className="h-display text-2xl tabular-nums sm:text-3xl">{nf.format(r.value)}</p>
              <p className="text-xs opacity-80">{unitOf(unit, r.value)}</p>
              {r.detail && <p className="truncate text-xs opacity-80">{r.detail}</p>}
            </m.div>
            <m.div
              aria-hidden
              className={`grid origin-bottom place-items-center border-3 border-line ${STEP[tier]} ${TIER_COLOUR[tier]}`}
              style={{ boxShadow: 'var(--shadow-ink-sm)' }}
              initial={animate ? { scaleY: 0 } : false}
              animate={{ scaleY: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: DELAY[i] }}
            >
              <span className="h-display text-4xl sm:text-5xl">{r.rank}</span>
            </m.div>
          </li>
        );
      })}
    </ul>
  );
}

function Row({
  tied,
  r,
  unit,
  i,
  animate,
  pinned,
}: {
  tied?: boolean;
  r: BoardRow;
  unit: Unit;
  i: number;
  animate: boolean;
  pinned?: boolean;
}) {
  return (
    <m.li
      className={`flex items-center gap-3 rounded border-2 border-line px-3 py-2 ${r.you ? 'bg-c3 text-on-c3' : 'bg-bg'}`}
      initial={animate ? { x: -20 } : false}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: Math.min(i, 12) * 0.03 }}
    >
      <span className="w-10 shrink-0 text-center">
        <span className="h-display block text-2xl tabular-nums leading-none">{r.rank}</span>
        {tied && <span className="block text-[0.65rem] uppercase leading-tight">tied</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          <Who r={r} />
          {pinned && <span className="sr-only"> (outside the top list)</span>}
        </span>
        {r.detail && <span className="block truncate text-xs opacity-80">{r.detail}</span>}
      </span>
      <span className="h-head shrink-0 text-right tabular-nums">
        {nf.format(r.value)}
        <span className="ml-1 font-normal text-xs opacity-80">{unitOf(unit, r.value)}</span>
      </span>
    </m.li>
  );
}

/** Every row after the podium's first three (ranks can repeat when fans tie), then the viewer's own row if it is not listed. */
export function RankedList({
  rows,
  you,
  unit,
  from = 3,
}: {
  rows: BoardRow[];
  you: BoardRow | null;
  unit: Unit;
  from?: number;
}) {
  const animate = useAnimate();
  const rest = rows.slice(from);
  const shared = shareCounts(rows);
  const pinned = you && !rows.some((r) => r.you) ? you : null;
  if (rest.length === 0 && !pinned) return null;
  return (
    <div className="panel p-3 sm:p-4">
      {rest.length > 0 && (
        <ul aria-label="More of the board" className="space-y-1.5">
          {rest.map((r, i) => (
            <Row
              // biome-ignore lint/suspicious/noArrayIndexKey: names can be withheld (empty), ranks repeat.
              key={i}
              r={r}
              tied={r.tied || (shared.get(r.rank) ?? 0) > 1}
              unit={unit}
              i={i}
              animate={animate}
            />
          ))}
        </ul>
      )}
      {pinned && (
        <>
          {rest.length > 0 && (
            <p aria-hidden className="py-1 text-center text-muted tracking-[0.5em]">
              ···
            </p>
          )}
          <ul aria-label="Your place" className={rest.length > 0 ? '' : 'mt-0'}>
            <Row
              r={pinned}
              tied={pinned.tied || shared.has(pinned.rank)}
              unit={unit}
              i={0}
              animate={animate}
              pinned
            />
          </ul>
        </>
      )}
    </div>
  );
}
