/**
 * Realm faces are preloaded once, by root.tsx, from the sacred skin's `type.preload`
 * (app/skins/sacred.ts). The routes keep exporting `links` from this constant; it is empty on
 * purpose so the same three woff2 files are not announced twice.
 */
export const SACRED_FONT_LINKS: never[] = [];
