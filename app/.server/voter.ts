/**
 * Who is voting. Fans vote as themselves; guests get a random, long-lived HttpOnly id (never
 * derived from IP or user agent, so it can't be reversed and rotating headers doesn't mint voters).
 */
import { readCookie } from './auth';
import { ENV } from './env';
import { randomToken, VOTER_COOKIE } from './guard';

export function guestId(request: Request): string | null {
  const v = readCookie(request, VOTER_COOKIE);
  return v && /^[A-Za-z0-9_-]{22,64}$/.test(v) ? v : null;
}

export function newGuest(): { id: string; cookie: string } {
  const id = randomToken(18);
  const secure = ENV.prod ? '; Secure' : '';
  return {
    id,
    cookie: `${VOTER_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
  };
}
