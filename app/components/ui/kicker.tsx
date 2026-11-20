import type { HTMLAttributes } from 'react';
import { cx } from './cx';

/** Small caps label above a heading. */
export function Kicker({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx('kicker', className)} {...rest} />;
}
