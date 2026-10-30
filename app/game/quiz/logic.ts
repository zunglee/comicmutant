/** Pure Quiz Duel rules: CPU answering model, damage, sampling, winner. Unit-tested. */
import { shuffle } from '../engine/math';
import type { Difficulty, QuizQ } from '../types';

export const QUESTION_TIME = 15;
export const QUESTIONS = 10;
export const MAX_HP = 100;
/** How many questions the route loader ships; each Start samples QUESTIONS of them. */
export const POOL_SIZE = 30;
/** Once player 1 has locked in, the CPU answers within this many seconds. */
export const CPU_HURRY = 1;
/** Answers locked within this many seconds deal full speed damage. */
export const FAST_WINDOW = 3;
/** Seconds the answer + "why" stay up after the last hit, before the next question. */
export const READ_TIME = 4;

export const BASE_DMG = 5;
export const SPEED_DMG = 5;
/** Consecutive right answers (including this one) that make a COMBO: damage ×COMBO_MULT. */
export const COMBO_AT = 3;
export const COMBO_MULT = 2;
/** Right answers in a row that set a fighter ON FIRE (bigger effects; the ×2 holds). */
export const FIRE_AT = 5;
/** A wrong answer hands the opponent a counter-hit — blind guessing loses HP on average. */
export const COUNTER_DMG = 6;
/** Chance a right CPU pick turns wrong when player 1's lock-in rushes it. */
export const HURRY_SLIP = 0.3;

export const QUIZ_AI: Record<Difficulty, { accuracy: number; min: number; max: number }> = {
  easy: { accuracy: 0.4, min: 6, max: 12 },
  normal: { accuracy: 0.65, min: 3.5, max: 8 },
  hard: { accuracy: 0.88, min: 1.8, max: 4.5 },
};

/** CPU picks an option and a time to lock in. Wrong picks are spread over the other options. */
export function cpuAnswer(
  d: Difficulty,
  answer: number,
  options: number,
  rand: () => number,
): { choice: number; delay: number } {
  const p = QUIZ_AI[d];
  const delay = Math.min(QUESTION_TIME - 0.5, p.min + rand() * (p.max - p.min));
  if (rand() < p.accuracy) return { choice: answer, delay };
  const wrong = Math.floor(rand() * (options - 1));
  return { choice: wrong >= answer ? wrong + 1 : wrong, delay };
}

/**
 * When the CPU locks in, given its plan and when player 1 locked (null = not yet).
 * After P1 locks, the CPU's remaining wait is cut to CPU_HURRY so nobody sits idle.
 */
export const cpuLockAt = (delay: number, p1LockedAt: number | null) =>
  p1LockedAt === null ? delay : Math.min(delay, p1LockedAt + CPU_HURRY);

/**
 * The CPU's locked answer. Its time is always its own planned delay, so hurrying it never earns it
 * speed damage; and if it was rushed (P1 locked in more than CPU_HURRY before its plan), a right
 * pick slips to a wrong one HURRY_SLIP of the time. Answering fast is a real edge.
 */
export function cpuLock(
  plan: { choice: number; delay: number },
  p1LockedAt: number | null,
  answer: number,
  options: number,
  rand: () => number,
): { choice: number; time: number; hurried: boolean } {
  const hurried = p1LockedAt !== null && p1LockedAt + CPU_HURRY < plan.delay;
  let choice = plan.choice;
  if (hurried && choice === answer && rand() < HURRY_SLIP) {
    const wrong = Math.floor(rand() * (options - 1));
    choice = wrong >= answer ? wrong + 1 : wrong;
  }
  return { choice, time: plan.delay, hurried };
}

/** 0..1 speed factor: 1 inside FAST_WINDOW, falling to 0 at the buzzer. */
export function speedFactor(elapsed: number) {
  const k = (elapsed - FAST_WINDOW) / (QUESTION_TIME - FAST_WINDOW);
  return 1 - Math.max(0, Math.min(1, k));
}

/** Damage multiplier for a right answer that makes `streak` in a row. */
export const comboMult = (streak: number) => (streak >= COMBO_AT ? COMBO_MULT : 1);

/**
 * Damage for a right answer locked `elapsed` seconds in, where `streak` counts this answer.
 * 5 base + up to 5 for speed, ×2 from the third right answer in a row:
 * six fast answers = 10+10+20+20+20+20 = 100 → a K.O.; five are not enough (80).
 */
export const quizDamage = (elapsed: number, streak = 1) =>
  (BASE_DMG + Math.round(speedFactor(elapsed) * SPEED_DMG)) * comboMult(streak);

/** Higher value wins (used with HP left). */
export function quizWinner(v: [number, number]): 'p1' | 'p2' | 'draw' {
  return v[0] > v[1] ? 'p1' : v[1] > v[0] ? 'p2' : 'draw';
}

/** Shuffle a question's options, keeping `answer` pointing at the right one. */
export function shuffleOptions(q: QuizQ, rand: () => number): QuizQ {
  const order = shuffle(
    q.options.map((_, i) => i),
    rand,
  );
  return { ...q, options: order.map((i) => q.options[i] ?? ''), answer: order.indexOf(q.answer) };
}

/**
 * Pick `n` questions for one match: questions not in `recent` first (so a replay asks new ones),
 * at most one per character where possible, options shuffled.
 */
export function sampleQuestions(
  pool: readonly QuizQ[],
  n: number,
  rand: () => number,
  recent: ReadonlySet<string> = new Set(),
): QuizQ[] {
  const mixed = shuffle(pool, rand);
  const fresh = mixed.filter((q) => !recent.has(q.q));
  const stale = mixed.filter((q) => recent.has(q.q));
  const out: QuizQ[] = [];
  const names = new Set<string>();
  for (const group of [fresh, stale])
    for (const unique of [true, false])
      for (const q of group) {
        if (out.length >= n) break;
        if (out.includes(q) || (unique && names.has(q.name))) continue;
        names.add(q.name);
        out.push(q);
      }
  return out.map((q) => shuffleOptions(q, rand));
}

/**
 * Font step for an answer button so long answers fit without breaking inside a word:
 * long words (names like "Samuthirakani") or long answers get smaller type.
 */
export function answerFit(text: string): '' | 'text-sm' | 'text-xs' {
  const word = Math.max(0, ...text.split(/[\s-]+/).map((w) => w.length));
  if (word >= 12 || text.length > 28) return 'text-xs';
  if (word >= 10 || text.length > 18) return 'text-sm';
  return '';
}
