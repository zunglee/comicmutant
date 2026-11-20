import type { HTMLAttributes } from 'react';
import { cx } from './cx';

/** `plain` card surface, `c1` accent surface. Border, shadow, radius and tilt follow the skin. */
export type PanelTone = 'plain' | 'c1';

export function Panel({
  tone = 'plain',
  halftone,
  className,
  ...rest
}: { tone?: PanelTone; halftone?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(tone === 'c1' ? 'panel-c1' : 'panel', halftone && 'halftone', className)}
      {...rest}
    />
  );
}
