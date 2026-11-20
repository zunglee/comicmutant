/**
 * Runtime configuration. Production refuses to start without the settings that security depends
 * on (see SECURITY.md § Configuration) — a silent fallback there means fake rate limits or
 * reversible visitor ids.
 */
const prod = process.env.NODE_ENV === 'production';

/** A positive integer setting, else the default (unset, junk, zero or negative never loosen it). */
export function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw || !/^\d{1,9}$/.test(raw.trim())) return fallback;
  const n = Number(raw.trim());
  return n > 0 ? n : fallback;
}

/** Defaults for the poll/reaction ceilings (S15); e2e raises them, production keeps these. */
export const DEFAULT_MINT_CEILING = 60;
export const DEFAULT_VOTE_CAP = 5;

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
  /** New poll/reaction voter cookies per IP (IPv6 /64) per 10 minutes, soft (S15). */
  mintCeiling: positiveInt(process.env.COMICMUTANT_MINT_CEILING, DEFAULT_MINT_CEILING),
  /** Counted new guest voters per IP (IPv6 /64) per poll or profile per hour (S15). */
  voteCap: positiveInt(process.env.COMICMUTANT_VOTE_CAP, DEFAULT_VOTE_CAP),
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
