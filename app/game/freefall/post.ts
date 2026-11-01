/** Posting a finished run, shared by the game and the page (a guest run posted after sign-in). */
export const PENDING_KEY = 'cm_ff_pending';

export interface PendingRun {
  token: string;
  log: number[];
  score: number;
  level: string;
}

/**
 * A guest's finished runs wait here until sign-in: one slot per mode, so practising after today's
 * dive never overwrites the ranked run (a later daily start isn't ranked, so it's never kept).
 */
export type Pending = Partial<Record<'daily' | 'practice', PendingRun>>;

export function readPending(): Pending {
  try {
    const v = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Pending) : {};
  } catch {
    return {};
  }
}

export function keepPending(mode: 'daily' | 'practice', run: PendingRun) {
  try {
    const all = readPending();
    if (mode === 'daily' && all.daily) return; // the first daily run is the one that counts
    if (mode === 'practice' && (all.practice?.score ?? -1) >= run.score) return; // keep the best
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...all, [mode]: run }));
  } catch {
    /* storage blocked: the run just can't wait for sign-in */
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}

export interface Posted {
  ok: boolean;
  stored?: boolean;
  rank?: number;
  of?: number;
  score?: number;
  reason?: string;
  error?: string;
  login?: boolean;
  review?: boolean;
  pending?: boolean;
  best?: boolean;
}

export async function postRun(token: string, log: number[]): Promise<Posted> {
  try {
    const res = await fetch('/api/freefall/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, log }),
    });
    return (await res.json()) as Posted;
  } catch {
    return { ok: false, error: 'Network error — your run is kept in this tab. Try again.' };
  }
}
