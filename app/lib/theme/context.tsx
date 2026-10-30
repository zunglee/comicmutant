/** Live theme state: current pack + the top-5 dock, shared by the dock and the theme browser. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyPack, downloadPack, saveTop5 } from './client';
import type { ThemePack } from './compute';

/** A pack in hand, or a catalogue reference ({ slug, v }) to download first. */
export type ThemeRef = ThemePack | { slug: string; v: string };

interface ThemeState {
  current: ThemePack;
  top5: ThemePack[];
  equip: (ref: ThemeRef, from?: { x: number; y: number }) => Promise<void>;
  pin: (pack: ThemePack) => void;
  unpin: (slug: string) => void;
  move: (slug: string, dir: -1 | 1) => void;
}

const Ctx = createContext<ThemeState | null>(null);

const isPack = (r: ThemeRef): r is ThemePack => 'vars' in r;

export function ThemeProvider({
  initial,
  top5: initialTop5,
  children,
}: {
  initial: ThemePack;
  top5: ThemePack[];
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState(initial);
  const [top5, setTop5] = useState(initialTop5);

  useEffect(() => {
    const on = (e: Event) => setCurrent((e as CustomEvent<ThemePack>).detail);
    window.addEventListener('cm:theme', on);
    return () => window.removeEventListener('cm:theme', on);
  }, []);

  const equip = useCallback(
    async (ref: ThemeRef, from?: { x: number; y: number }) => {
      const pack = isPack(ref)
        ? ref
        : (top5.find((p) => p.slug === ref.slug && p.v === ref.v) ??
          (await downloadPack(ref.slug, ref.v)));
      applyPack(pack, from);
    },
    [top5],
  );

  const commit = useCallback((next: ThemePack[]) => {
    setTop5(next);
    saveTop5(next.map((p) => p.slug));
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      current,
      top5,
      equip,
      // Pinning a sixth theme bumps the oldest pin off the end.
      pin: (pack) => commit([pack, ...top5.filter((p) => p.slug !== pack.slug)].slice(0, 5)),
      unpin: (slug) => commit(top5.filter((p) => p.slug !== slug)),
      move: (slug, dir) => {
        const i = top5.findIndex((p) => p.slug === slug);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= top5.length) return;
        const next = [...top5];
        [next[i], next[j]] = [next[j] as ThemePack, next[i] as ThemePack];
        commit(next);
      },
    }),
    [current, top5, equip, commit],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
