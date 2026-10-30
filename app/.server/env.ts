/**
 * Runtime configuration. Production refuses to start without the settings that security depends
 * on (see SECURITY.md § Configuration) — a silent fallback there means fake rate limits or
 * reversible visitor ids.
 */
const prod = process.env.NODE_ENV === 'production';

export const ENV = {
  prod,
  /** Public origin, e.g. https://comicmutant.com. Drives Secure cookies and the CSRF check. */
  origin: process.env.COMICMUTANT_ORIGIN,
  /** Server secret: keys bucket hashing and peppers password hashes. */
  secret: process.env.COMICMUTANT_SECRET ?? 'comicmutant-dev-only-secret',
  /**
   * Where the client IP comes from: `cf-connecting-ip` (behind Cloudflare only), `x-forwarded-for`
   * (right-most entry, appended by your own proxy) or `none` (single client / direct serve).
   */
  ipHeader: process.env.COMICMUTANT_IP_HEADER ?? (prod ? undefined : 'none'),
  lab: !prod || process.env.COMICMUTANT_LAB === '1',
} as const;

let checked = false;
export function assertProductionEnv(): void {
  if (checked || !prod) return;
  checked = true;
  const missing = [
    !process.env.COMICMUTANT_ORIGIN && 'COMICMUTANT_ORIGIN',
    (process.env.COMICMUTANT_SECRET ?? '').length < 32 && 'COMICMUTANT_SECRET (32+ chars)',
    !['cf-connecting-ip', 'x-forwarded-for', 'none'].includes(ENV.ipHeader ?? '') &&
      'COMICMUTANT_IP_HEADER',
  ].filter(Boolean);
  if (missing.length)
    throw new Error(`ComicMutant: set ${missing.join(', ')} before running in production.`);
}
