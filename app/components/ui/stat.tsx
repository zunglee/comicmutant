import type { ReactNode } from 'react';
import { cx } from './cx';

/** A number with a label: score, count, year. */
export function Stat({
  value,
  label,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('panel p-3 text-center', className)}>
      <p className="h-display text-3xl text-c1-text-card">{value}</p>
      <p className="kicker text-card-fg!">{label}</p>
    </div>
  );
}
