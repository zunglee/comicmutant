import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { cx } from './cx';

/**
 * Toggle chip: a button with aria-pressed (filters, tags you can switch). For a static label use
 * <Badge>.
 */
export function Chip({
  pressed,
  className,
  type = 'button',
  ...rest
}: { pressed: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'>) {
  return <button type={type} aria-pressed={pressed} className={cx('chip', className)} {...rest} />;
}

/** Static label pill (not interactive). */
export function Badge({
  tone = 'plain',
  className,
  ...rest
}: { tone?: 'plain' | 'c1' | 'c2' | 'c3' } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        'chip pointer-events-none',
        tone === 'c1' && 'bg-c1! text-on-c1!',
        tone === 'c2' && 'bg-c2! text-on-c2!',
        tone === 'c3' && 'bg-c3! text-on-c3!',
        className,
      )}
      {...rest}
    />
  );
}
