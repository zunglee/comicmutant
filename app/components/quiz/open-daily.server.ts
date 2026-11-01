/** Server only: the viewer's open daily, so the hub and the intro can offer "Resume". */
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { clientIp } from '~/.server/guard';
import { guestId } from '~/.server/voter';
import type { OpenDaily } from '~/lib/quiz-contract';

type Sql = Awaited<ReturnType<typeof getSql>>;

/**
 * Looks up the open daily through core's `openDaily(sql, owner, now)`. Missing export or any failure
 * means "no resume prompt", never a broken page.
 */
export async function loadOpenDaily(request: Request): Promise<OpenDaily | null> {
  try {
    const mod = (await import('~/.server/quiz')) as {
      openDaily?: (
        sql: Sql,
        owner: { user: Awaited<ReturnType<typeof currentUser>>; guest: string | null; ip: string },
        now: number,
      ) => Promise<OpenDaily | null>;
    };
    if (typeof mod.openDaily !== 'function') return null;
    const sql = await getSql();
    const user = await currentUser(sql, request);
    return (
      (await mod.openDaily(
        sql,
        { user, guest: guestId(request) ?? null, ip: clientIp(request) },
        Date.now(),
      )) ?? null
    );
  } catch {
    return null;
  }
}

/** How many daily starts this browser/account has left today (null when core can't say). */
export async function loadDailyStartsLeft(request: Request): Promise<number | null> {
  try {
    const mod = (await import('~/.server/quiz')) as {
      dailyStartsLeft?: (sql: Sql, owner: unknown, now: number) => Promise<number>;
      ownerFromRequest?: (sql: Sql, request: Request) => Promise<unknown>;
    };
    if (typeof mod.dailyStartsLeft !== 'function' || typeof mod.ownerFromRequest !== 'function') {
      return null;
    }
    const sql = await getSql();
    const owner = await mod.ownerFromRequest(sql, request);
    const n = await mod.dailyStartsLeft(sql, owner, Date.now());
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}
