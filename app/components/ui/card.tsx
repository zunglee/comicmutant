import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Heading } from './heading';

/** Panel with padding and an optional title row: the default content block. */
export function Card({
  title,
  kicker,
  tone = 'plain',
  as: Tag = 'article',
  className,
  children,
  ...rest
}: {
  title?: ReactNode;
  kicker?: ReactNode;
  tone?: 'plain' | 'c1';
  as?: 'article' | 'section' | 'div' | 'li';
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <Tag className={cx(tone === 'c1' ? 'panel-c1' : 'panel', 'p-4', className)} {...rest}>
      {kicker && <p className="kicker">{kicker}</p>}
      {title && (
        <Heading kind="head" level={3} className="text-xl">
          {title}
        </Heading>
      )}
      {children}
    </Tag>
  );
}
