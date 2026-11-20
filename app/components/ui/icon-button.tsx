import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonVariant } from './button';
import { cx } from './cx';

/** Square 44px icon-only button. `label` is the accessible name (required: there is no text). */
export function IconButton({
  label,
  children,
  variant = 'plain',
  className,
  ...rest
}: {
  label: string;
  children: ReactNode;
  variant?: ButtonVariant;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <Button
      variant={variant}
      size="sm"
      aria-label={label}
      className={cx('size-11 p-0', className)}
      {...rest}
    >
      {children}
    </Button>
  );
}
