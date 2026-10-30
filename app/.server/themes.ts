/**
 * Theme registry. Every character and original is a theme; the house theme is the default.
 * Packs are served by /themes/pack/:slug (long-cached, versioned) and computed on demand from
 * content, so a new character JSON is a new theme with no build step.
 */
import { CLIP_GATE } from '~/lib/clips/gate';
import type { ThemeSpec } from '~/lib/schema';
import { packVersion, type ThemePack, themeVars } from '~/lib/theme/compute';
import { readCookie } from './auth';
import { allCharacters, allFighters, getCharacter, getFighter } from './content';

export const THEME_COOKIE = 'cm_theme';
export const TOP5_COOKIE = 'cm_top5';

export const HOUSE: { slug: string; name: string; spec: ThemeSpec } = {
  slug: 'house',
  name: 'ComicMutant',
  spec: {
    palette: { c1: '#ff2e4d', c2: '#1b1464', c3: '#ffd400' },
    motif: 'chaos',
    mood: 'dark',
    tagline: 'Every universe, one loud page.',
  },
};

interface Resolved {
  slug: string;
  name: string;
  universe: string;
  kind: string;
  spec: ThemeSpec;
  sprite: boolean;
}

export function resolveTheme(slug: string | null | undefined): Resolved | null {
  if (!slug) return null;
  if (slug === HOUSE.slug) return { ...HOUSE, universe: 'house', kind: 'house', sprite: false };
  const c = getCharacter(slug);
  if (c)
    return { slug, name: c.name, universe: c.universe, kind: c.kind, spec: c.theme, sprite: false };
  const f = getFighter(slug);
  if (f)
    return { slug, name: f.alias, universe: 'original', kind: f.kind, spec: f.theme, sprite: true };
  return null;
}

const packs = new Map<string, ThemePack>();

/** Memoised: a pack is pure data derived from immutable content. */
export function packFor(slug: string): ThemePack | null {
  const hit = packs.get(slug);
  if (hit) return hit;
  const r = resolveTheme(slug);
  if (!r) return null;
  const pack: ThemePack = {
    slug: r.slug,
    name: r.name,
    universe: r.universe,
    kind: r.kind,
    motif: r.spec.motif,
    mood: r.spec.mood,
    tagline: r.spec.tagline,
    vars: themeVars(r.spec),
    clips: r.sprite ? CLIP_GATE.sprite : CLIP_GATE.motif,
    sprite: r.sprite,
    v: packVersion(r.spec),
  };
  packs.set(slug, pack);
  return pack;
}

/** Default dock: the hottest theme from each universe, so the five feel different. */
export function defaultTop5(): string[] {
  const out: string[] = [HOUSE.slug];
  for (const u of ['marvel', 'dc', 'indian']) {
    const c = allCharacters().find((x) => x.universe === u);
    if (c) out.push(c.slug);
  }
  const f = [...allFighters()].sort((a, b) => b.heat - a.heat)[0];
  if (f) out.push(f.slug);
  return out.slice(0, 5);
}

export function readThemeState(request: Request) {
  const cur = resolveTheme(readCookie(request, THEME_COOKIE)) ?? resolveTheme(HOUSE.slug);
  const raw = readCookie(request, TOP5_COOKIE);
  const picked = (raw ? raw.split(',') : defaultTop5()).filter((s) => resolveTheme(s)).slice(0, 5);
  const top5 = (picked.length ? picked : defaultTop5())
    .map((s) => packFor(s))
    .filter((p) => p !== null);
  // biome-ignore lint/style/noNonNullAssertion: HOUSE always resolves.
  const current = packFor(cur!.slug)!;
  return { current, top5 };
}
