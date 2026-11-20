/**
 * Server-side skin selection (reports/skins-design.md T4): the root loader calls pickSkin() so the
 * first paint already wears the right skin. Server-only (reads content); the rules themselves live
 * in registry.ts so the client resolves identically after a navigation.
 */
import { readCookie } from '~/.server/auth';
import { getCharacter } from '~/.server/content';
import { characterSlug, isSkinId, resolveSkin, SKIN_COOKIE, type SkinSource } from './registry';
import type { SkinId } from './types';

/** The visitor's pinned skin, or null (absent, or junk that no longer names a skin). */
export function readPinned(request: Request): SkinId | null {
  const v = readCookie(request, SKIN_COOKIE);
  return isSkinId(v) ? v : null;
}

export function pickSkin(
  request: Request,
  pathname: string,
): { id: SkinId; source: SkinSource; pinned: SkinId | null } {
  const pinned = readPinned(request);
  const slug = characterSlug(pathname);
  const universe = slug ? (getCharacter(safeDecode(slug))?.universe ?? null) : null;
  return { ...resolveSkin({ pathname, pinned, universe }), pinned };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
