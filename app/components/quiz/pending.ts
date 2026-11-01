/**
 * A guest's finished game waits here until they join: one slot, and only for the claim window the
 * server allows (30 min, same guest cookie), so a stale entry is dropped instead of posted.
 */
import type { QuizMode } from '~/lib/quiz-contract';

const KEY = 'cm_qz_pending';
export const CLAIM_WINDOW_MS = 30 * 60_000;

export interface PendingGame {
  game: string;
  mode: QuizMode;
  label: string;
  score: number;
  correct: number;
  total: number;
  at: number;
}

export function readPending(): PendingGame | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PendingGame | null;
    if (!v || typeof v.game !== 'string' || Date.now() - v.at > CLAIM_WINDOW_MS) return null;
    return v;
  } catch {
    return null;
  }
}

export function keepPending(p: PendingGame) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the game just can't wait for sign-in */
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
