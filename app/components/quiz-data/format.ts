/** Small formatting helpers shared by the Fact Frenzy data pages (leaders, my stats, mod analytics). */
import { UNIVERSE_LABEL, type Universe } from '~/lib/taxonomy';

export const nf = new Intl.NumberFormat('en-IN');

export function universeName(u: string): string {
  return UNIVERSE_LABEL[u as Universe] ?? u;
}

/** "powers-and-abilities" → "Powers and abilities". */
export function topicName(t: string): string {
  const s = t.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as const;

export const MODE_LABEL = {
  daily: 'Daily challenge',
  universe: 'Universe quiz',
  character: 'Character quiz',
} as const;

/** "1 Nov" in IST on both server and browser (fixed zone, so hydration matches). */
export function shortDate(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(new Date(at));
}

/** "Mon 27 Oct" from an IST day string "2026-10-27". */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

/** Only http(s) links are rendered as links; anything else is shown as plain text. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}
