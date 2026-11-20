import type { ComponentPropsWithRef } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from './cx';

/** `c1` primary accent, `c3` secondary accent, `plain` card surface. */
export type ButtonVariant = 'c1' | 'c3' | 'plain';
export type ButtonSize = 'md' | 'sm';

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width, label left-aligned (menus). */
  block?: boolean;
};

export function buttonClass({
  variant = 'plain',
  size = 'md',
  block,
  className,
}: Shared & { className?: string }) {
  return cx(
    'btn',
    variant === 'c1' && 'btn-c1',
    variant === 'c3' && 'btn-c3',
    size === 'sm' && 'btn-sm',
    block && 'w-full',
    className,
  );
}

/** A <button>. Look, radius, shadow, case and motion come from the skin through `.btn`. */
export function Button({
  variant,
  size,
  block,
  className,
  type = 'button',
  ...rest
}: Shared & ComponentPropsWithRef<'button'>) {
  return (
    <button type={type} className={buttonClass({ variant, size, block, className })} {...rest} />
  );
}

/** A router <Link> that looks like a Button. */
export function ButtonLink({ variant, size, block, className, ...rest }: Shared & LinkProps) {
  return <Link className={buttonClass({ variant, size, block, className })} {...rest} />;
}
