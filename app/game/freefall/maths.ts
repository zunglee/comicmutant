/**
 * Mind-maths for the answer gates. Pure and seeded: the same rng sequence gives the same sums on the
 * client and in the server replay. Three school levels; `stage` (gates cleared ÷ 5) raises the
 * difficulty inside a level. Integer arithmetic only.
 */
export const LEVELS = ['easy', 'normal', 'hard'] as const;

/** A number as the sums print it: a real minus sign, like the sums' own "−". */
export const fmt = (n: number) => (n < 0 ? `−${-n}` : String(n));
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  easy: 'Class 3–4',
  normal: 'Class 5–6',
  hard: 'Class 7+',
};

export interface Question {
  /** As shown: "7 × 8", "? + 9 = 23". */
  text: string;
  /** As read aloud: "7 times 8". */
  say: string;
  answer: number;
  /** Three distinct options; `correct` indexes the answer. */
  options: [number, number, number];
  correct: 0 | 1 | 2;
}

type Rand = () => number;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;

interface Sum {
  text: string;
  say: string;
  answer: number;
  /** Mistakes a child actually makes for this sum (wrong operation, carry slip…). */
  traps: number[];
  /** Traps allowed even when far from the answer (the sign flip of a negative result). */
  keep?: number[];
  /** A square n²: its traps are other squares (else "the only perfect square" gives it away). */
  root?: number;
  /** Options outside [lo, hi] are impossible for this sum (14 + 5 can't be 8): never offered. */
  lo?: number;
  hi?: number;
  /** Every option differs from the answer by a multiple of this (a product's 0/5/even ending). */
  step?: number;
}

const add = (a: number, b: number): Sum => ({
  lo: Math.max(a, b) + 1,
  text: `${a} + ${b}`,
  say: `${a} plus ${b}`,
  answer: a + b,
  traps: [a + b + 10, a + b - 10, a * b, a + b + 1, a + b - 1],
});
const sub = (a: number, b: number): Sum => ({
  hi: a - 1,
  text: `${a} − ${b}`,
  say: `${a} minus ${b}`,
  answer: a - b,
  traps: [a + b, a - b + 10, a - b - 10, a - b + 1, a - b - 1],
});
const mul = (a: number, b: number): Sum => ({
  // More than the bigger factor. (The tighter "at least twice it" would rule out the tens traps that
  // stop the ones digit from giving the answer away; a ten-out product is a real slip.)
  lo: Math.max(a, b) + 1,
  // A product ending in 0 (10 × 9, 5 × 4), in 5, or even: every option keeps that ending, or the odd
  // one out is the answer (10 × 9 offering 79 and 81; 5 × 4 offering 15 and 25).
  step: (a * b) % 10 === 0 ? 10 : (a * b) % 5 === 0 ? 5 : (a * b) % 2 === 0 ? 2 : 1,
  text: `${a} × ${b}`,
  say: `${a} times ${b}`,
  answer: a * b,
  traps: [a * b + a, a * b - a, a * b + b, a * b - b, a + b, a * b + 10],
});
const div = (q: number, b: number): Sum => ({
  // 1 is never a tempting quotient here (16 ÷ 2 offering 1); answers start at 3.
  lo: 2,
  hi: q * b - 1,
  text: `${q * b} ÷ ${b}`,
  say: `${q * b} divided by ${b}`,
  answer: q,
  traps: [q + 1, q - 1, q + 2, q * 2, q * b - b],
});
const missing = (a: number, b: number): Sum => ({
  hi: a + b - 1,
  text: `? + ${a} = ${a + b}`,
  say: `what plus ${a} makes ${a + b}`,
  answer: b,
  traps: [a + b + a, b + 1, b - 1, b + 10, a],
});
const half = (n: number): Sum => ({
  lo: 2,
  hi: n * 2 - 1,
  text: `½ of ${n * 2}`,
  say: `half of ${n * 2}`,
  answer: n,
  traps: [n * 4, n + 1, n - 1, n + 2, n * 2 - 2],
});
const square = (n: number): Sum => ({
  root: n,
  text: `${n}²`,
  say: `${n} squared`,
  answer: n * n,
  traps: [n * 2, n * n + n, n * n - n, n * n + 1, (n + 1) * (n + 1)],
});
const root = (n: number): Sum => ({
  lo: 2,
  hi: n * n - 1,
  text: `√${n * n}`,
  say: `square root of ${n * n}`,
  answer: n,
  traps: [n + 1, n - 1, n * 2, Math.floor((n * n) / 2), n + 2],
});
const percent = (p: number, of: number): Sum => ({
  lo: 2,
  hi: of - 1,
  text: `${p}% of ${of}`,
  say: `${p} percent of ${of}`,
  answer: (p * of) / 100,
  traps: [(p * of) / 10, of - (p * of) / 100, p + of / 10, (p * of) / 100 + 5, of / p],
});
const order = (a: number, b: number, c: number): Sum => ({
  // a + b × c is more than either a or b × c.
  lo: Math.max(a, b * c) + 1,
  text: `${a} + ${b} × ${c}`,
  say: `${a} plus ${b} times ${c}`,
  answer: a + b * c,
  traps: [(a + b) * c, a + b + c, a * b + c, a + b * c + 1, a + b * c - c],
});
const neg = (a: number, b: number): Sum => ({
  // a − b with a ≥ 0 lands between −b and −1.
  lo: -b + 1,
  hi: -1,
  text: `${a} − ${b}`,
  say: `${a} minus ${b}`,
  answer: a - b,
  traps: [a + b, -(a + b), a - b + 1, a - b - 1, a - b + 10, a - b - 10],
  keep: [b - a],
});

/** One sum for this level/stage. Stage 0 is gentle; the pool widens, then the numbers grow, up to stage 6. */
function sum(r: Rand, level: Level, stage: number): Sum {
  const s = Math.min(stage, 6);
  if (level === 'easy') {
    const kinds = ['add', 'sub', 'add', 'sub', 'mul', 'half'].slice(0, 2 + s);
    const k = pick(r, kinds);
    const top = 10 + s * 12;
    if (k === 'add') return add(int(r, 2, top), int(r, 2, Math.min(top, 20 + s * 5)));
    if (k === 'sub') {
      // Answers of 4 and up: below that there's no room for traps that aren't a giveaway.
      const a = int(r, 8, top + 10);
      return sub(a, int(r, 1, a - 4));
    }
    if (k === 'mul') return mul(pick(r, [2, 3, 4, 5, 10]), int(r, 2, 10));
    return half(int(r, 5, 10 + s * 5));
  }
  if (level === 'normal') {
    const kinds = ['mul', 'add', 'div', 'sub', 'missing', 'half', 'mul'].slice(0, 3 + s);
    const k = pick(r, kinds);
    if (k === 'mul') return mul(int(r, 2, 6 + s * 2), int(r, 3, 9 + s));
    if (k === 'div') return div(int(r, 3, 9 + s), int(r, 2, 6 + s * 2));
    if (k === 'add') return add(int(r, 12, 40 + s * 15), int(r, 9, 40 + s * 10));
    if (k === 'sub') {
      const a = int(r, 30, 80 + s * 20);
      return sub(a, int(r, 9, a - 5));
    }
    if (k === 'missing') return missing(int(r, 6, 30), int(r, 5, 25 + s * 5));
    return half(int(r, 12, 40 + s * 10));
  }
  const kinds = ['mul', 'square', 'percent', 'order', 'neg', 'root', 'div', 'mul'].slice(0, 4 + s);
  const k = pick(r, kinds);
  if (k === 'mul') return mul(int(r, 12, 19 + s * 4), int(r, 3, 9));
  if (k === 'square') return square(int(r, 4, 12 + s * 2));
  if (k === 'percent') {
    const p = pick(r, [10, 20, 25, 50, 75]);
    const step = p === 75 || p === 25 ? 4 : p === 20 ? 5 : 10;
    return percent(p, step * int(r, 3, 10 + s * 5));
  }
  if (k === 'order') return order(int(r, 2, 12), int(r, 2, 9), int(r, 2, 9));
  if (k === 'neg') {
    const a = int(r, 3, 20 + s * 5);
    return neg(a, a + int(r, 2, 15 + s * 5));
  }
  if (k === 'root') return root(int(r, 4, 13 + s * 2));
  return div(int(r, 6, 15 + s * 2), int(r, 6, 12));
}

/**
 * A question with three options in seeded lane order, built so that nothing but the sum gives the
 * answer away:
 *  - the *shape* of the three numbers (two gaps) is drawn first, then the answer goes in a uniformly
 *    random slot of it — so value rank, "the outer one of the two closest" or any other rule on the
 *    gaps is worth a third, a guess;
 *  - gaps come from the slips a child makes for this sum (operation mix-ups, ±1, a ten out), so the
 *    traps still tempt;
 *  - one family per question: all three end in the same digit (gaps of tens), or no two do;
 *  - never evenly spaced, never negative or 0 for a positive answer, never absurdly far.
 */
export function makeQuestion(r: Rand, level: Level, stage: number): Question {
  // A sum whose options can't all be made fair (a tiny answer with nothing below it) is redrawn —
  // never patched with a fallback that would give the answer away.
  for (let tries = 0; ; tries++) {
    const q = optionsFor(r, level, sum(r, level, stage));
    if (q || tries > 60) return q ?? makeQuestion(r, level, stage + 1);
  }
}

function optionsFor(r: Rand, level: Level, s: Sum): Question | null {
  const a = s.answer;
  // Small positive answers get small traps; negative ones can take tens (−13: −3, −23).
  const small = a >= 0 && a < 15;
  const step = s.step ?? 1;
  // A trap equal to a number in the sum ("8 − 2" offering 8) is one a child rules out at a glance.
  const operands = (s.text.match(/\d+/g) ?? []).map(Number);
  const ok = (t: number) =>
    Number.isInteger(t) &&
    t !== a &&
    !operands.includes(Math.abs(t)) &&
    t >= (s.lo ?? Number.NEGATIVE_INFINITY) &&
    t <= (s.hi ?? Number.POSITIVE_INFINITY) &&
    (a < 0 || t > 0 || (a === 0 && t >= 0)) &&
    // Not absurdly small next to the answer (√484 offering 2): at least 0.4× it from 10 up.
    (a < 10 || t >= 0.4 * a);
  const end = (t: number) => Math.abs(t) % 10;
  const reach = Math.max(small ? 5 : 20, Math.floor(Math.abs(a) * 0.6));
  // Distances of the classic mistakes for this sum (e.g. 6 × 7: ±6, ±7, ±10).
  const slips = s.traps.map((t) => Math.abs(t - a)).filter((d) => d > 0 && d <= reach);
  // Tens shapes (all three end in the same digit) are the norm from 30 up on Class 5–6 and 7+, so
  // working out only the ones digit doesn't find the answer; Class 3–4 keeps more ±1 slips (D15).
  const tensFirst = !small && r() < (level === 'easy' ? 0.7 : Math.abs(a) >= 30 ? 0.97 : 0.85);
  const gapsFor = (tens: boolean) =>
    (tens
      ? [10, 20, ...(Math.abs(a) >= 50 ? [30] : [])]
      : [...new Set([1, 2, 3, 4, 5, 6, 9, 11, 15, ...slips])].filter(
          (d) => d % 10 !== 0 && d <= reach,
        )
    ).filter((d) => d % step === 0);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
  const slot = Math.floor(r() * 3); // where the answer sits in the shape (= its value rank)
  let two: [number, number] | null = null;
  if (s.root) {
    // Neighbouring squares around n², the answer at its chosen rank.
    const n = s.root;
    const up = r() < 0.5 ? [1, 2] : [1, 3];
    const down = [-1, -2].filter((o) => n + o >= 1);
    const offs =
      slot === 0 ? up : slot === 2 && down.length === 2 ? down : [down[0] ?? 2, pick([1, 2])];
    two = [(n + (offs[0] as number)) ** 2, (n + (offs[1] as number)) ** 2];
  }
  for (const tens of two ? [] : tensFirst ? [true, false] : [false, true]) {
    if (tens && small) continue;
    const gaps = gapsFor(tens);
    if (!gaps.length) continue;
    for (let tries = 0; tries < 40 && !two; tries++) {
      // Evenly spaced is fine: the shape is drawn before the answer's slot, so it says nothing.
      const g1 = pick(gaps);
      const g2 = pick(gaps);
      // The whole spread stays tempting (15 offering 45 is a joke), whatever the slot.
      // Tens shapes need 20–30 of spread: fine from 15 up on Class 5–6 and 7+; tighter on Class 3–4.
      if (g1 + g2 > Math.max(reach, tens ? (level === 'easy' ? 20 : 30) : 8)) continue;
      const offs = [0, g1, g1 + g2];
      const at = (k: number) => {
        const vals = offs.map((o) => a - (offs[k] as number) + o);
        return { vals, traps: vals.filter((_, j) => j !== k) as [number, number] };
      };
      // Valid with the answer in *every* slot, so which shapes survive says nothing about the slot.
      const fine = (k: number) => {
        const { vals, traps } = at(k);
        return traps.every(ok) && (tens || step > 1 || new Set(vals.map(end)).size === 3);
      };
      if (![0, 1, 2].every(fine)) continue;
      two = at(slot).traps;
    }
    if (two) break;
  }
  if (!two?.every(ok)) return null;
  const correct = Math.floor(r() * 3) as 0 | 1 | 2;
  const order = r() < 0.5 ? two : ([two[1], two[0]] as [number, number]);
  const options = [0, 1, 2].map((i) =>
    i === correct ? a : (order[i < correct ? i : i - 1] as number),
  ) as [number, number, number];
  return { text: s.text, say: s.say, answer: a, options, correct };
}
