/**
 * Fact Frenzy wire contract: the only quiz shapes the browser sees. Zod-free so client code can import
 * it. The server keeps answers; a question reaches the browser without one and the answer comes back
 * only after the player has locked in (or the clock ran out).
 */
import type { PublishedUniverse } from './taxonomy';

export const QUIZ_MODES = ['daily', 'universe', 'character'] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];

/** Seconds a player gets per question (the server adds network grace on top). */
export const QUESTION_SECONDS = 15;
export const QUESTIONS_PER_GAME = 10;

/** Stable error codes on `{ ok: false }` replies (Q22) — the UI branches on these, never on text. */
export const QUIZ_ERROR_CODES = [
  'daily-open', // a daily is already open for this fan/browser
  'daily-cap', // daily starts used up today
  'closed', // the daily's IST day ended
  'replaced', // a newer game in the same lane ended this one
  'expired', // game older than its time to live
  'over', // game already finished
  'order', // wrong index (not current / not served / already answered with another choice)
  'login', // claim needs sign-in
  'rate', // slow down
  'invalid', // bad body / unknown target
  'other',
] as const;
export type QuizErrorCode = (typeof QUIZ_ERROR_CODES)[number];
export type QuizError = { ok: false; error: string; code: QuizErrorCode };

/** One question as the player sees it: options already shuffled for this player. */
export interface QuizQuestionView {
  /** Position in this game, 0-based. */
  index: number;
  q: string;
  options: [string, string, string, string];
  difficulty: 1 | 2 | 3;
  topic: string;
  character: { slug: string; name: string; universe: PublishedUniverse };
  seconds: number;
}

/** POST /api/quiz/start */
export interface QuizStartBody {
  mode: QuizMode;
  /** mode = universe */
  universe?: PublishedUniverse;
  /** mode = character */
  character?: string;
}
export type QuizStartReply =
  | {
      ok: true;
      /** Signed game id; send it back with every answer. */
      game: string;
      mode: QuizMode;
      total: number;
      /** True when this game can reach a leaderboard (signed in; daily = first attempt only). */
      ranked: boolean;
      /** Why not ranked, in plain words, when ranked is false. */
      unrankedWhy?: string;
      /** Null only when a resumed daily turned out to be finished (its last clock ran out): see `summary`. */
      question: QuizQuestionView | null;
      /** Set when a resumed daily is already finished — show the end screen. */
      summary?: QuizSummary;
      /** Q23a: this is your open daily, resumed — where it stands. */
      resumed?: { score: number; streak: number; answered: number; grid: string };
    }
  | QuizError;

/** POST /api/quiz/answer. choice -1 = the clock ran out. */
export interface QuizAnswerBody {
  game: string;
  index: number;
  choice: -1 | 0 | 1 | 2 | 3;
}
export interface QuizReveal {
  /** Null on a blind daily practice answer (Q16b): locked in, result unlocks at midnight IST. */
  correct: boolean | null;
  /** True for a blind daily practice answer (Q16b). */
  blind: boolean;
  /**
   * Index of the right option in the shuffled options the player saw. Null on today's daily when the
   * player got it wrong (Q10: the answer unlocks at midnight IST).
   */
  answer: number | null;
  /** Null when the answer is locked (see `answer`). */
  why: string | null;
  source: string | null;
  /** True when this is a daily answer that stays locked until midnight IST. */
  locked: boolean;
  /** True when the clock ran out (no choice counted). */
  timedOut: boolean;
  /** Points this question earned (0 when wrong). */
  points: number;
  /** Server-measured seconds from question shown to answer received. */
  seconds: number;
  streak: number;
  score: number;
  /** Share of all answers to this question that were right, 0–100; null under 20 answers. */
  fansRight: number | null;
}
export interface QuizSummary {
  score: number;
  correct: number;
  total: number;
  bestStreak: number;
  /** Facts this player got right on first sight in this game (Q12; signed-in only). */
  newFacts: number;
  ranked: boolean;
  /** Place on `board` after this game, when ranked and this game set the player's row there. */
  rank: number | null;
  /** Which board `rank` is on, e.g. "Today's daily", "Marvel best", "Facts known". */
  board: string | null;
  /** Ranked but held for a mod look (too fast / too perfect): the owner sees why. */
  held: boolean;
  personalBest: boolean;
  /** 10 cells, ✓ ✗ or ⏱, for the share card. */
  grid: string;
  /** True when a guest can still claim this game by joining (within the claim window). */
  claimable: boolean;
  /** Q17: the rank is in a gated place and the fan isn't trusted yet — name shows after a quick check. */
  nameWithheld: boolean;
  /** Q16b: blind daily practice — per-question results unlock at midnight IST; `score` is 0 (Q20d). */
  blind: boolean;
}
/**
 * The reveal never carries the next question: the player reads the `why` on their own time, then asks
 * for the next one (POST /api/quiz/next), and only then does that question's clock start (D-Q9).
 */
export type QuizAnswerReply =
  | { ok: true; reveal: QuizReveal; more: boolean; summary: QuizSummary | null }
  | QuizError;

/**
 * POST /api/quiz/next — serve question `index` (the one after the last answered). Its clock starts on
 * the first call; calling again returns the same question with the clock still running from then.
 */
export interface QuizNextBody {
  game: string;
  index: number;
}
export type QuizNextReply = { ok: true; question: QuizQuestionView } | QuizError;

/** POST /api/quiz/claim — a guest who just joined attaches their finished game. */
export interface QuizClaimBody {
  game: string;
}
export type QuizClaimReply = { ok: true; summary: QuizSummary } | QuizError;

/** POST /api/quiz/report — "this fact is wrong". */
export interface QuizReportBody {
  game: string;
  index: number;
  reason: 'wrong-answer' | 'unclear' | 'typo' | 'other';
  note?: string;
}

export const BOARDS = ['daily', 'universe', 'facts'] as const;

/** Hub / play loader: the viewer's open daily, so the page can offer "Resume" (round 5). */
export interface OpenDaily {
  /** 0-based index of the current question. */
  index: number;
  total: number;
  /** Seconds left on the current question's clock; null when it hasn't been served yet. */
  secondsLeft: number | null;
  ranked: boolean;
}

/** Hub loader: yesterday's daily, answers unlocked (Q10). Null before the first daily. */
export interface DailyArchive {
  day: string;
  questions: {
    q: string;
    options: [string, string, string, string];
    answer: number;
    why: string;
    source: string;
    character: { slug: string; name: string; universe: PublishedUniverse };
    /** 0–100, null under 20 answers. */
    fansRight: number | null;
  }[];
}
export type BoardId = (typeof BOARDS)[number];

export interface BoardRow {
  rank: number;
  name: string;
  value: number;
  /** Secondary line: e.g. "9/10 · 1m 42s" or "312 facts". */
  detail: string;
  you: boolean;
  /** Q17: name hidden ("Name withheld · awaiting a quick check"); `name` is then empty for others. */
  withheld: boolean;
  /** Rank shared with another row (equal value). */
  tied?: boolean;
}

/** A scouting signal for mods (round 7: strength is a field, never parsed from text). */
export interface QuizSignal {
  text: string;
  /** Strong = same browser / saw these questions before; weak = same network (carrier NAT) or tight band. */
  strong: boolean;
}

/** /mod/quiz trust queue (Q17/Q18): an untrusted fan in a gated place, or a tight-band flag. */
export interface TrustCheck {
  userId: number;
  name: string;
  /** Best game behind the check. */
  gameId: number;
  label: string;
  score: number;
  correct: number;
  total: number;
  times: number[];
  /** Per-answer reading floor in seconds, same order as `times`. */
  floors: number[];
  /** e.g. "#1 on Today's daily", "tight band: σ 0.21 s over floor". */
  reasons: string[];
  /** Q21: scouting signals, e.g. "2 blind dailies from this IP today", "saw 4 of these questions before". */
  signals: QuizSignal[];
  /** Board whose cap approving this game sets (Q19), e.g. "Marvel best"; daily = per game. */
  board: string;
  at: number;
}

/** Loader data for /quiz/me (signed-in fan). */
export interface FanStats {
  games: number;
  answered: number;
  correct: number;
  /** 0–100 */
  accuracy: number;
  bestStreak: number;
  /** Q12: facts known on first sight ("Facts known" board). */
  factsMastered: number;
  /** Out of the whole live bank. */
  bankSize: number;
  avgSeconds: number;
  byUniverse: { universe: PublishedUniverse; answered: number; accuracy: number }[];
  byTopic: { topic: string; answered: number; accuracy: number }[];
  byDifficulty: { difficulty: 1 | 2 | 3; answered: number; accuracy: number }[];
  /** Lowest accuracy, at least 3 answers each, worst first (max 5). */
  weakest: { slug: string; name: string; answered: number; accuracy: number }[];
  /** Newest first, max 10. */
  recent: {
    at: number;
    mode: QuizMode;
    label: string;
    score: number;
    correct: number;
    total: number;
    held: boolean;
    /** A blind game (blind daily, or a held-flood day, Q26) still on its IST day: no result shown. */
    blind?: boolean;
  }[];
  /** Best ranks right now, null when not on that board. */
  ranks: { daily: number | null; facts: number | null };
}

/** Loader data for /mod/quiz. */
export interface SiteStats {
  /** Oldest first, 14 IST days. */
  perDay: { day: string; games: number; players: number }[];
  byMode: { mode: QuizMode; games: number }[];
  byUniverse: { universe: PublishedUniverse; games: number; accuracy: number }[];
  /** Questions with ≥ 20 answers. */
  hardest: { id: string; q: string; answered: number; accuracy: number }[];
  easiest: { id: string; q: string; answered: number; accuracy: number }[];
  totals: {
    games: number;
    players: number;
    answers: number;
    bank: number;
    retired: number;
    /** Round 9: finished blind dailies, counted apart from the games above. */
    blindDailies?: number;
  };
}
export interface HeldGame {
  id: number;
  name: string;
  mode: QuizMode;
  label: string;
  score: number;
  correct: number;
  total: number;
  /** Per-answer server seconds, in order. */
  times: number[];
  /** Per-answer reading floor in seconds, same order (Q23). */
  floors: number[];
  /** Scouting signals, as on TrustCheck (Q23). */
  signals: QuizSignal[];
  reason: string;
  at: number;
  /** Round 9: other held games by this fan that day, folded into this card (latest shown). */
  more?: number;
}
export interface ReportRow {
  questionId: string;
  q: string;
  answer: string;
  why: string;
  source: string;
  reports: number;
  reasons: string[];
  notes: string[];
  retired: boolean;
}
