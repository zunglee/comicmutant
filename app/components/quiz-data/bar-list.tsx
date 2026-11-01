/**
 * A plain accessible bar chart: one row per item, the label and the value are always text (colour is
 * never the only cue), the bar is decoration (aria-hidden) that grows in with a transform.
 */
import { m } from 'motion/react';
import { useAnimate } from '~/lib/fx';

export interface BarItem {
  key: string;
  label: string;
  /** Bar length, 0..max. */
  value: number;
  /** The value as text, e.g. "72%". */
  display: string;
  /** Small second line, e.g. "18 answered". */
  sub?: string;
  /** Text badge such as "your strongest". */
  tag?: string;
  /** Too few answers to compare: a neutral bar and muted text, so a thin row never looks like a verdict. */
  dim?: boolean;
}

const TONE = { c1: 'bg-c1', c2: 'bg-c2', c3: 'bg-c3' } as const;

export function BarList({
  items,
  max = 100,
  tone = 'c3',
  empty = 'Nothing here yet.',
  className = '',
}: {
  items: BarItem[];
  max?: number;
  tone?: keyof typeof TONE;
  empty?: string;
  className?: string;
}) {
  const animate = useAnimate();
  if (items.length === 0) return <p className="text-muted text-sm">{empty}</p>;
  return (
    <ul className={`space-y-3 ${className}`}>
      {items.map((it, i) => {
        const k = max > 0 ? Math.max(0, Math.min(1, it.value / max)) : 0;
        return (
          <li key={it.key}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold text-sm">
                {it.label}
                {it.tag && (
                  <span className="ml-2 rounded border-2 border-line px-1.5 py-px font-normal text-xs uppercase tracking-wide">
                    {it.tag}
                  </span>
                )}
              </span>
              <span className={`h-head text-base tabular-nums ${it.dim ? 'text-muted' : ''}`}>
                {it.display}
                {it.sub && <span className="ml-2 font-normal text-muted text-xs">{it.sub}</span>}
              </span>
            </div>
            <div aria-hidden className="h-4 overflow-hidden rounded border-2 border-line bg-bg">
              <m.div
                className={`h-full origin-left border-line ${k > 0 ? 'border-r-2' : ''} ${it.dim ? 'bg-muted' : TONE[tone]}`}
                style={{ width: `${k * 100}%` }}
                initial={animate ? { scaleX: 0 } : false}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ type: 'spring', stiffness: 160, damping: 22, delay: i * 0.05 }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
