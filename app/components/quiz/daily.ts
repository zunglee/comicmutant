/** Fact Frenzy helpers shared by the loaders and the browser: IST day maths, labels, mode links. */
import type { OpenDaily, QuizMode } from '~/lib/quiz-contract';
import type { PublishedUniverse } from '~/lib/taxonomy';

const DAY = 86_400_000;
const IST = 19_800_000; // UTC+5:30, no daylight saving

// Intl formatters are slow to build (tens of ms on a phone), so build each once.
let dayFmt: Intl.DateTimeFormat | undefined;
let labelFmt: Intl.DateTimeFormat | undefined;

/** Today in India as YYYY-MM-DD (the day boundary of the daily challenge). */
export function istDay(at = Date.now()): string {
  dayFmt ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
  return dayFmt.format(new Date(at));
}

/** "Sun 1 Nov" for an IST day string. */
export function istDayLabel(at = Date.now()): string {
  labelFmt ??= new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return labelFmt.format(new Date(at));
}

/** Milliseconds until the next midnight in India. */
export function msToIstMidnight(at = Date.now()): number {
  return DAY - ((at + IST) % DAY);
}

/** "5h 12m" / "42m" / "<1m". */
export function hhmm(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return mins < 1 ? 'under a minute' : `${m}m`;
}

export interface PlayTarget {
  mode: QuizMode;
  universe?: PublishedUniverse;
  character?: string;
}

/** The /quiz/play URL for a game. */
export function playHref(t: PlayTarget): string {
  const p = new URLSearchParams({ mode: t.mode });
  if (t.mode === 'universe' && t.universe) p.set('u', t.universe);
  if (t.mode === 'character' && t.character) p.set('c', t.character);
  return `/quiz/play?${p.toString()}`;
}

/** Where a guest goes to join/log in and lands back to claim the finished game. */
export const CLAIM_NEXT = '/quiz/play?claim=1';
export const joinHref = `/join?next=${encodeURIComponent(CLAIM_NEXT)}`;
export const loginHref = `/login?next=${encodeURIComponent(CLAIM_NEXT)}`;

/** "Sat 31 Oct" for an IST day string (YYYY-MM-DD). */
export function dayLabelOf(day: string): string {
  return istDayLabel(new Date(`${day}T12:00:00+05:30`).getTime());
}

/** Absolute /quiz/play URL for the share text: the very quiz that was played. */
export function shareUrl(t: PlayTarget, origin: string): string {
  return `${origin}${playHref(t)}`;
}

let numFmt: Intl.NumberFormat | undefined;
/** 1,23,456: one cached formatter (`toLocaleString` builds a new one on every call). */
export function fmt(n: number): string {
  numFmt ??= new Intl.NumberFormat('en-IN');
  return numFmt.format(n);
}

/** "Your daily is open: question 4 of 10, clock running (9s left)". */
export function resumeLine(o: OpenDaily): string {
  const where = `question ${o.index + 1} of ${o.total}`;
  if (o.secondsLeft === null) return `Your daily is open: ${where}, next question ready.`;
  const left = Math.max(0, Math.round(o.secondsLeft));
  if (left === 0) return `Time ran out on question ${o.index + 1}. Resume to see what's next.`;
  return `Your daily is open: ${where}, clock running (${left}s left).`;
}
