import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cx } from './cx';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/**
 * Tab strip (WAI-ARIA tablist): arrow keys move, the active tab is a pressed Chip. The caller
 * renders the panel and gives it role="tabpanel" aria-labelledby={`${idPrefix}-${active}`}.
 */
export function Tabs<T extends string>({
  items,
  active,
  onChange,
  label,
  idPrefix = 'tab',
  className,
}: {
  items: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix?: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = items[(i + d + items.length) % items.length];
    if (!next) return;
    onChange(next.id);
    refs.current[next.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx('flex flex-wrap gap-2', className)}>
      {items.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-${t.id}`}
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          className="chip"
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
