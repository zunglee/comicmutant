/**
 * "Load more" without re-sending earlier pages: the loader returns one page; later pages come
 * from a fetcher hitting the same route with ?page=n and are appended here. `resetKey` (the
 * current filters) clears the appended pages when the list changes.
 */
import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';

export function useAppendPages<T, D extends { page: number }>(
  first: T[],
  resetKey: string,
  pick: (d: D) => T[],
  idOf: (t: T) => string | number,
) {
  const f = useFetcher<D>();
  const [extra, setExtra] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger.
  useEffect(() => {
    setExtra([]);
    setPage(1);
  }, [resetKey]);
  useEffect(() => {
    if (f.state !== 'idle' || !f.data) return;
    const got = pick(f.data as D);
    const p = (f.data as D).page;
    setExtra((x) => {
      const seen = new Set([...first, ...x].map(idOf));
      return [...x, ...got.filter((t) => !seen.has(idOf(t)))];
    });
    setPage(p);
  }, [f.state, f.data, first, pick, idOf]);
  return {
    items: [...first, ...extra],
    page,
    loading: f.state !== 'idle',
    load: (url: string) => f.load(url),
  };
}
