/**
 * POST /api/quiz/report — { game, index, reason, note? }: "this fact looks wrong", for a question the
 * player has already answered. Lands in the /mod/quiz queue; one report per question per game.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { assertSameOrigin, clientIp } from '~/.server/guard';
import { fail, quizBody, quizRate, reportQuestion } from '~/.server/quiz';
import { guestId } from '~/.server/voter';
import type { Route } from './+types/quiz-report';

const Body = z.object({
  game: z.string().min(10).max(80),
  index: z.number().int().min(0).max(40),
  reason: z.enum(['wrong-answer', 'unclear', 'typo', 'other']),
  note: z.string().max(300).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data(fail('POST only', 'invalid'), { status: 405 });
  assertSameOrigin(request);
  const raw = await quizBody(request, 1024, 'Report too long.');
  if (!raw.ok) return data(raw.reply, { status: raw.status });
  const b = Body.safeParse(raw.body);
  if (!b.success) {
    const long = b.error.issues.some((i) => i.path[0] === 'note' && i.code === 'too_big');
    return data(
      fail(long ? 'Report too long (300 characters at most).' : 'invalid report', 'invalid'),
      {
        status: 400,
      },
    );
  }
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const guest = guestId(request);
  if (!(await quizRate(sql, 'report', { user, guest, ip: clientIp(request) }, 20, 600_000)))
    return data(fail('Slow down a little.', 'rate'), { status: 429 });
  const r = await reportQuestion(sql, b.data, { user, guest });
  return r.ok ? r : data(r, { status: 422 });
}
