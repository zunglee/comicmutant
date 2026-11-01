import type { QuizSignal, TrustCheck } from '~/lib/quiz-contract';

/** One game with every board it is waiting on (the core lists a game once per board). */
export interface TrustGroup {
  gameId: number;
  userId: number;
  name: string;
  label: string;
  score: number;
  correct: number;
  total: number;
  times: number[];
  floors: number[];
  signals: QuizSignal[];
  at: number;
  boards: { board: string; reasons: string[] }[];
}

/** Fold the per-game-and-board queue into one entry per game, keeping the queue's order. */
export function groupTrust(items: TrustCheck[]): TrustGroup[] {
  const byGame = new Map<number, TrustGroup>();
  for (const t of items) {
    let g = byGame.get(t.gameId);
    if (!g) {
      g = {
        gameId: t.gameId,
        userId: t.userId,
        name: t.name,
        label: t.label,
        score: t.score,
        correct: t.correct,
        total: t.total,
        times: t.times,
        floors: t.floors,
        signals: [],
        at: t.at,
        boards: [],
      };
      byGame.set(t.gameId, g);
    }
    for (const s of t.signals) if (!g.signals.some((x) => x.text === s.text)) g.signals.push(s);
    const row = g.boards.find((b) => b.board === t.board);
    if (!row) g.boards.push({ board: t.board, reasons: [...t.reasons] });
    else for (const r of t.reasons) if (!row.reasons.includes(r)) row.reasons.push(r);
  }
  return [...byGame.values()];
}
