/**
 * "Your record" — per-game results kept in this browser only (localStorage). Server-side
 * persistence of scores is a TODO for the lead; nothing here touches the DB.
 */
import type { GameId, GameResult } from './types';

export const RECORDS_KEY = 'cm_arena_records';

export interface GameRecord {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  /** Best winning margin (your score minus theirs). */
  bestMargin: number;
  /** Highest score you've put up. */
  bestScore: number;
  streak: number;
  last?: {
    p1: string;
    p2: string;
    winner: GameResult['winner'];
    score: [number, number];
    at: number;
  };
}

export type Records = Partial<Record<GameId, GameRecord>>;

const empty = (): GameRecord => ({
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  bestMargin: 0,
  bestScore: 0,
  streak: 0,
});

/** Pure: fold one result (seen from P1, the local player) into the records. */
export function applyResult(
  recs: Records,
  r: GameResult,
  p1: string,
  p2: string,
  at = Date.now(),
): Records {
  const prev = recs[r.game] ?? empty();
  const won = r.winner === 'p1';
  const lost = r.winner === 'p2';
  const next: GameRecord = {
    played: prev.played + 1,
    wins: prev.wins + (won ? 1 : 0),
    losses: prev.losses + (lost ? 1 : 0),
    draws: prev.draws + (!won && !lost ? 1 : 0),
    bestMargin: won ? Math.max(prev.bestMargin, r.score[0] - r.score[1]) : prev.bestMargin,
    bestScore: Math.max(prev.bestScore, r.score[0]),
    streak: won ? prev.streak + 1 : 0,
    last: { p1, p2, winner: r.winner, score: r.score, at },
  };
  return { ...recs, [r.game]: next };
}

export function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as Records) : {};
  } catch {
    return {};
  }
}

export function saveResult(r: GameResult, p1: string, p2: string): Records {
  const next = applyResult(loadRecords(), r, p1, p2);
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the record just isn't kept */
  }
  return next;
}
