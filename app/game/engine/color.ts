/**
 * Colour helpers for canvas drawing. Results are memoised (the rig asks for the same shades every
 * frame), keyed on the amount quantised to 1/1000 so animated amounts (1 - p, 0.3 + sin t, …)
 * can't grow the cache without bound; the cache is also hard-capped.
 */

const CACHE_MAX = 4000;
const cache = new Map<string, string>();
function remember(key: string, value: string): string {
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, value);
  return value;
}
/** Current cache size (tests / diagnostics). */
export const colorCacheSize = () => cache.size;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hx = (v: number) =>
  Math.round(Math.max(0, Math.min(255, v)))
    .toString(16)
    .padStart(2, '0');

/** Mix two #rrggbb colours. */
export function mixHex(a: string, b: string, t: number): string {
  const q = Math.round(t * 1000);
  const key = `m${a}${b}${q}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const k = q / 1000;
  const x = rgb(a);
  const y = rgb(b);
  return remember(
    key,
    `#${hx(x[0] + (y[0] - x[0]) * k)}${hx(x[1] + (y[1] - x[1]) * k)}${hx(x[2] + (y[2] - x[2]) * k)}`,
  );
}

/** amt < 0 darkens toward ink, amt > 0 lightens toward white. */
export const shade = (hex: string, amt: number) =>
  amt < 0 ? mixHex(hex, '#0d0b10', -amt) : mixHex(hex, '#ffffff', amt);

export function alpha(hex: string, a: number): string {
  const q = Math.round(Math.max(0, Math.min(1, a)) * 1000);
  const key = `a${hex}${q}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [r, g, b] = rgb(hex);
  return remember(key, `rgba(${r},${g},${b},${(q / 1000).toFixed(3)})`);
}

/** Relative luminance 0..1 (WCAG). */
export function lum(hex: string): number {
  const c = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}

/** Lift colours that would vanish against ink outlines so silhouettes keep their shape. */
export const readable = (hex: string, min = 0.035) => {
  let c = hex;
  for (let i = 0; i < 8 && lum(c) < min; i++) c = mixHex(c, '#ffffff', 0.08);
  return c;
};

/** Whichever palette colour is brightest — used for rim light and FX cores. */
export function brightest(...hexes: string[]): string {
  let best = hexes[0] ?? '#ffffff';
  for (const h of hexes) if (lum(h) > lum(best)) best = h;
  return best;
}

export const INK = '#0d0b10';
export const PAPER = '#fbf4e2';
