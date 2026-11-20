import type { ReactNode } from 'react';
import { cx } from './cx';
import { Heading } from './heading';
import { Kicker } from './kicker';

/** Page section: optional kicker + title, then content, labelled for assistive tech. */
export function Section({
  id,
  kicker,
  title,
  children,
  className,
}: {
  id: string;
  kicker?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={title ? `${id}-h` : undefined}
      className={cx('mx-auto w-full max-w-7xl px-4 py-8', className)}
    >
      {kicker && <Kicker>{kicker}</Kicker>}
      {title && (
        <Heading id={`${id}-h`} level={2} ink className="text-4xl text-c1-text sm:text-5xl">
          {title}
        </Heading>
      )}
      {children}
    </section>
  );
}
