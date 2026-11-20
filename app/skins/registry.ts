/**
 * Every skin, plus the pure rules that pick one (reports/skins-design.md T4). Browser-safe: the
 * server (select.ts) and the client (context.tsx) resolve with the same function, so a client
 * navigation lands on the skin the server would have painted.
 *
 * A new skin = its spec file (app/skins/<id>.ts, fonts included) + ONE line in SKINS below. SkinId,
 * SKIN_IDS, FONT_URLS and skinFontImports are all derived from it.
 */
import { comic } from './comic';
import { crime } from './crime';
import { desi } from './desi';
import { sacred } from './sacred';
import type { SkinId, SkinSpec } from './types';

export const SKINS = { comic, sacred, crime, desi } as const satisfies Record<string, SkinSpec>;

/** Registry order (picker order). */
export const SKIN_IDS = Object.keys(SKINS) as SkinId[];

export const DEFAULT_SKIN: SkinId = 'comic';

/** The pinned-choice cookie (set by POST /api/skin, read by SSR). */
export const SKIN_COOKIE = 'cm_skin';

export const isSkinId = (v: unknown): v is SkinId =>
  typeof v === 'string' && (SKIN_IDS as readonly string[]).includes(v);

/** Where a skin came from: a lock route, the visitor's pinned choice, a section default, or the house. */
export type SkinSource = 'lock' | 'pinned' | 'route' | 'default';

/** `/desi` matches `/desi` and `/desi/…`, never `/desirable`. */
const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const matches = (spec: SkinSpec, pathname: string) => spec.routes.some((r) => under(pathname, r));

/** A character page defaults to its universe's skin (Indian heroes → desi). */
const UNIVERSE_SKIN: Readonly<Record<string, SkinId>> = { indian: 'desi' };

/** `/c/<slug>` → slug, else null. */
export function characterSlug(pathname: string): string | null {
  const m = /^\/c\/([^/]+)\/?$/.exec(pathname);
  return m?.[1] ?? null;
}

/**
 * lock (on its routes) > pinned > route default > comic. `universe` is the universe of the
 * character a `/c/<slug>` page shows (null elsewhere or unknown).
 */
export function resolveSkin(input: {
  pathname: string;
  pinned: string | null | undefined;
  universe?: string | null;
}): { id: SkinId; source: SkinSource } {
  const { pathname, pinned, universe } = input;
  for (const id of SKIN_IDS) {
    if (SKINS[id].lock && matches(SKINS[id], pathname)) return { id, source: 'lock' };
  }
  if (isSkinId(pinned)) return { id: pinned, source: 'pinned' };
  for (const id of SKIN_IDS) {
    if (!SKINS[id].lock && matches(SKINS[id], pathname)) return { id, source: 'route' };
  }
  const byUniverse = characterSlug(pathname) && universe ? UNIVERSE_SKIN[universe] : undefined;
  if (byUniverse) return { id: byUniverse, source: 'route' };
  return { id: DEFAULT_SKIN, source: 'default' };
}

/** Every skin's preloadable woff2 files, merged (key → URL); each spec declares its own in `type.fontFiles`. */
export const FONT_URLS: Readonly<Record<string, string>> = Object.assign(
  {},
  ...SKIN_IDS.map((id) => SKINS[id].type.fontFiles),
);

/** The `<link rel=preload>` hrefs for a skin (unknown keys are skipped; the test flags them). */
export const preloadHrefs = (spec: SkinSpec): string[] =>
  spec.type.preload.map((k) => spec.type.fontFiles[k]).filter((h): h is string => !!h);

/**
 * Each skin's @font-face CSS loader (its spec's `type.fontLoaders`), awaited by the client before a
 * live switch paints. root.tsx imports the SSR-critical CSS statically (an @font-face only downloads
 * its file once text uses it), so a server render never waits on these.
 */
export const skinFontImports = Object.fromEntries(
  SKIN_IDS.map((id) => [id, SKINS[id].type.fontLoaders]),
) as Record<SkinId, () => Promise<unknown>>;
