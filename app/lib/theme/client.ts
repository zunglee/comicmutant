/**
 * Browser side of themes: apply a pack to <html>, remember it in a cookie (so SSR paints it next
 * time with no flash), keep downloaded packs in a local "locker", and manage the top-5 dock.
 * Every storage access is guarded: private windows and blocked storage just lose the cache.
 */
import type { ThemePack } from './compute';

const LOCKER_KEY = 'cm_locker';
const PACK_KEY = (slug: string) => `cm_pack:${slug}`;
const YEAR = 31536000;

function setCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: preference cookies read by SSR.
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function applyPack(pack: ThemePack, from?: { x: number; y: number }) {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (from && !reduce && root.dataset.fx !== 'lite') {
    const wipe = document.createElement('div');
    wipe.className = 'theme-wipe';
    wipe.style.setProperty('--wipe-x', `${from.x}px`);
    wipe.style.setProperty('--wipe-y', `${from.y}px`);
    wipe.style.setProperty('--wipe-bg', pack.vars['--c1'] ?? '#000');
    wipe.style.setProperty('--wipe-c', pack.vars['--c3'] ?? '#fff');
    document.body.appendChild(wipe);
    setTimeout(() => wipe.remove(), 700);
  }
  for (const [k, v] of Object.entries(pack.vars)) root.style.setProperty(k, v);
  root.dataset.theme = pack.slug;
  root.dataset.motif = pack.motif;
  root.style.colorScheme = pack.mood;
  setCookie('cm_theme', pack.slug);
  window.dispatchEvent(new CustomEvent<ThemePack>('cm:theme', { detail: pack }));
}

export function cachedPack(slug: string, v: string): ThemePack | null {
  try {
    const raw = store()?.getItem(PACK_KEY(slug));
    const p = raw ? (JSON.parse(raw) as ThemePack) : null;
    return p && p.v === v ? p : null;
  } catch {
    return null;
  }
}

/** "Download" a theme: fetch its pack once, keep it in the locker for instant re-equip. */
export async function downloadPack(slug: string, v: string): Promise<ThemePack> {
  const hit = cachedPack(slug, v);
  if (hit) return hit;
  const res = await fetch(`/themes/pack/${encodeURIComponent(slug)}?v=${encodeURIComponent(v)}`);
  if (!res.ok) throw new Error(`Theme ${slug} unavailable`);
  const pack = (await res.json()) as ThemePack;
  try {
    store()?.setItem(PACK_KEY(slug), JSON.stringify(pack));
    const locker = lockerSlugs();
    if (!locker.includes(slug))
      store()?.setItem(LOCKER_KEY, JSON.stringify([slug, ...locker].slice(0, 200)));
  } catch {
    /* storage full or blocked: the pack still applies this visit */
  }
  return pack;
}

/** Packs in the locker, newest first (whatever version was downloaded). */
export function lockerPacks(): ThemePack[] {
  const out: ThemePack[] = [];
  for (const slug of lockerSlugs()) {
    try {
      const raw = store()?.getItem(PACK_KEY(slug));
      if (raw) out.push(JSON.parse(raw) as ThemePack);
    } catch {
      /* skip a corrupt entry */
    }
  }
  return out;
}

export function lockerSlugs(): string[] {
  try {
    const v = JSON.parse(store()?.getItem(LOCKER_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function removeFromLocker(slug: string) {
  try {
    store()?.removeItem(PACK_KEY(slug));
    store()?.setItem(LOCKER_KEY, JSON.stringify(lockerSlugs().filter((s) => s !== slug)));
  } catch {
    /* ignore */
  }
}

export function saveTop5(slugs: string[]) {
  setCookie('cm_top5', slugs.slice(0, 5).join(','));
}
