/**
 * POST /api/quiz/claim — { game }: a guest who just joined attaches their finished game (same browser,
 * within 30 minutes). Signed-in fans only; 401 tells the client to offer sign-in.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { assertSameOrigin, clientIp } from '~/.server/guard';
import { claimGame, fail, quizBody, quizRate } from '~/.server/quiz';
import { guestId } from '~/.server/voter';
import type { Route } from './+types/quiz-claim';

const Body = z.object({ game: z.string().min(10).max(80) });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data(fail('POST only', 'invalid'), { status: 405 });
  assertSameOrigin(request);
  const raw = await quizBody(request, 256);
  if (!raw.ok) return data(raw.reply, { status: raw.status });
  const b = Body.safeParse(raw.body);
  if (!b.success) return data(fail('invalid game', 'invalid'), { status: 400 });
  const sql = await getSql();
  const user = await currentUser(sql, request);
  if (!user)
    // `login` kept for older clients; `code` is the contract.
    return data(
      { ...fail('Sign in to claim this game.', 'login'), login: true as const },
      { status: 401 },
    );
  if (!(await quizRate(sql, 'claim', { user, guest: null, ip: clientIp(request) }, 20, 60_000)))
    return data(fail('Slow down a little.', 'rate'), { status: 429 });
  const r = await claimGame(sql, b.data.game, user, guestId(request));
  return r.ok ? r : data(r, { status: 422 });
}
