/** 14-day games and players: one row per IST day, two labelled bars, numbers always in text. */
import { m } from 'motion/react';
import { useAnimate } from '~/lib/fx';
import type { SiteStats } from '~/lib/quiz-contract';
import { dayLabel, nf } from './format';

export function DayChart({ days }: { days: SiteStats['perDay'] }) {
  const animate = useAnimate();
  const max = Math.max(1, ...days.map((d) => d.games));
  if (days.length === 0) return <p className="text-muted text-sm">No games in the last 14 days.</p>;
  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-6 border-2 border-line bg-c1" /> Games
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-6 border-2 border-line bg-c3" /> Players
        </span>
      </figcaption>
      <ul className="space-y-2">
        {days.map((d, i) => (
          <li
            key={d.day}
            className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 sm:grid-cols-[6.5rem_1fr_9rem]"
          >
            <span className="text-sm">{dayLabel(d.day)}</span>
            <span aria-hidden className="block space-y-1">
              <span className="block h-3 overflow-hidden rounded-skin-s bg-bg">
                <m.span
                  className="block h-full origin-left border-line border-r-2 bg-c1"
                  style={{ width: `${(d.games / max) * 100}%` }}
                  initial={animate ? { scaleX: 0 } : false}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22, delay: i * 0.03 }}
                />
              </span>
              <span className="block h-2 overflow-hidden rounded-skin-s bg-bg">
                <m.span
                  className="block h-full origin-left border-line border-r-2 bg-c3"
                  style={{ width: `${(d.players / max) * 100}%` }}
                  initial={animate ? { scaleX: 0 } : false}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    type: 'spring',
                    stiffness: 160,
                    damping: 22,
                    delay: i * 0.03 + 0.05,
                  }}
                />
              </span>
            </span>
            <span className="col-span-2 mb-1 text-muted text-xs tabular-nums sm:col-span-1 sm:mb-0 sm:text-sm">
              {nf.format(d.games)} {d.games === 1 ? 'game' : 'games'} · {nf.format(d.players)}{' '}
              {d.players === 1 ? 'player' : 'players'}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
