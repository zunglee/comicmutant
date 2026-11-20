import type { HTMLAttributes } from 'react';
import { cx } from './cx';

type Level = 1 | 2 | 3 | 4;

/**
 * `display` = the skin's big title face (Bangers in comic), `head` = its section face. Pick the
 * level for the document outline; size with a Tailwind text-* class.
 */
export function Heading({
  kind = 'display',
  level = 2,
  ink,
  className,
  ...rest
}: {
  kind?: 'display' | 'head';
  level?: Level;
  /** Ink outline for display type over a busy background. */
  ink?: boolean;
} & HTMLAttributes<HTMLHeadingElement>) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={cx(kind === 'display' ? 'h-display' : 'h-head', ink && 'ink-text', className)}
      {...rest}
    />
  );
}
