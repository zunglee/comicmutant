/**
 * Live skin state (reports/skins-design.md T4/T6). The skin on screen is derived, never stored:
 * resolveSkin(path, pinned choice, character universe), the same rule the server painted with. A
 * pick is optimistic (the page re-skins at once with the spec's wipe), then POSTed to /api/skin so
 * SSR paints it next time. Never reloads the page.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useMatches } from 'react-router';
import { playWipe, setPackLayer } from '~/lib/theme/client';
import { useTheme } from '~/lib/theme/context';
import { htmlMood, htmlVars, packLayerFor } from './compute';
import { resolveSkin, SKIN_COOKIE, SKINS, type SkinSource, skinFontImports } from './registry';
import type { SkinId, SkinSpec } from './types';

type Point = { x: number; y: number };

interface SkinState {
  /** The skin on screen. */
  id: SkinId;
  spec: SkinSpec;
  source: SkinSource;
  /** The visitor's pinned choice (null = section defaults). May differ from `id` on a lock route. */
  pinned: SkinId | null;
  /** Pin a skin (null = back to section defaults). On a lock route the choice is stored, not shown. */
  setSkin: (id: SkinId | null, from?: Point) => Promise<void>;
}

/** Detail of the `cm:skin` window event fired after every live switch. */
export interface SkinEventDetail {
  id: SkinId;
  source: SkinSource;
  pinned: SkinId | null;
}

const Ctx = createContext<SkinState | null>(null);

/** The universe of the character a `/c/<slug>` page shows, from that route's loader data. */
function useCharacterUniverse(): string | null {
  const matches = useMatches();
  for (const m of matches) {
    const c = (m.loaderData as { c?: { universe?: unknown } } | undefined)?.c;
    if (m.pathname.startsWith('/c/') && typeof c?.universe === 'string') return c.universe;
  }
  return null;
}

/** Writes a skin onto <html>: every skin var, the character layer it allows, and the alias attrs. */
function paint(
  spec: SkinSpec,
  pack: { slug: string; vars: Record<`--${string}`, string>; mood: 'dark' | 'light' },
) {
  const root = document.documentElement;
  const vars = htmlVars(spec, pack.vars, pack.slug);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = htmlMood(spec, pack.mood);
  root.dataset.skin = spec.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bg'] ?? '');
}

/** The data-realm alias value for a resolved skin (shared with root.tsx's SSR). */
export const realmOf = (id: SkinId, source: SkinSource | undefined) =>
  id === 'sacred' && source === 'lock' ? 'sacred' : undefined;

export function SkinProvider({
  initial,
  children,
}: {
  initial: { id: SkinId; pinned: SkinId | null; source?: SkinSource };
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const universe = useCharacterUniverse();
  const { current } = useTheme();
  const [pinned, setPinned] = useState<SkinId | null>(initial.pinned);
  const { id, source } = resolveSkin({ pathname, pinned, universe });
  const spec = SKINS[id];
  // Module state read by applyPack: idempotent, and set before any child effect could equip a theme.
  setPackLayer(packLayerFor(spec));

  // What <html> wears right now (the server painted `initial.id`), and where the next wipe starts.
  const painted = useRef<SkinId>(initial.id);
  const wipeFrom = useRef<Point | undefined>(undefined);
  const pack = useRef(current);
  pack.current = current;

  useEffect(() => {
    if (painted.current === id) return;
    let live = true;
    const from = wipeFrom.current;
    wipeFrom.current = undefined;
    // The new skin's faces arrive first, so the swap never paints in fallback fonts.
    skinFontImports[id]()
      .catch(() => undefined)
      .then(() => {
        if (!live) return;
        const vars = htmlVars(spec);
        const flat = spec.motion.calm ? vars['--bg'] : vars['--c1'];
        playWipe(
          from,
          spec.motion.wipe === 'halftone'
            ? { bg: vars['--c1'] ?? '#000', c: vars['--c3'] ?? '#fff' }
            : { bg: flat ?? '#000', c: flat ?? '#000' },
          spec.motion.wipe,
        );
        paint(spec, pack.current);
        painted.current = id;
        window.dispatchEvent(
          new CustomEvent<SkinEventDetail>('cm:skin', { detail: { id, source, pinned } }),
        );
      });
    return () => {
      live = false;
    };
  }, [id, spec, source, pinned]);

  // One-release alias, ON THE SACRED ROUTES ONLY (S19): html[data-realm="sacred"] means "inside the
  // Sacred section", not "wearing the sacred skin"; a visitor who pins sacred elsewhere has no realm.
  useEffect(() => {
    const root = document.documentElement;
    if (realmOf(id, source)) root.dataset.realm = 'sacred';
    else delete root.dataset.realm;
  }, [id, source]);

  const setSkin = useCallback(async (next: SkinId | null, from?: Point) => {
    wipeFrom.current = from;
    setPinned(next);
    try {
      const res = await fetch('/api/skin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skin: next }),
      });
      if (!res.ok) throw new Error(`skin ${res.status}`);
    } catch {
      // Offline or refused: remember the pick in the browser so the next page still wears it.
      // biome-ignore lint/suspicious/noDocumentCookie: preference cookie read by SSR.
      document.cookie = next
        ? `${SKIN_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
        : `${SKIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  }, []);

  const value = useMemo<SkinState>(
    () => ({ id, spec, source, pinned, setSkin }),
    [id, spec, source, pinned, setSkin],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The skin state, or null outside a SkinProvider (widgets rendered on their own, e.g. in tests). */
export function useSkinMaybe(): SkinState | null {
  return useContext(Ctx);
}

export function useSkin(): SkinState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSkin outside SkinProvider');
  return v;
}
