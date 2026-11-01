/**
 * POST /api/quiz/answer — { game, index, choice } (choice -1 = the clock ran out). Checked and timed
 * on the server; returns the reveal, the next question (or null) and, after the last one, the summary.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { assertSameOrigin, clientIp } from '~/.server/guard';
import { answerQuestion, fail, quizBody, quizRate } from '~/.server/quiz';
import { guestId } from '~/.server/voter';
import type { Route } from './+types/quiz-answer';

const Body = z.object({
  game: z.string().min(10).max(80),
  index: z.number().int().min(0).max(40),
  choice: z.union([z.literal(-1), z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data(fail('POST only', 'invalid'), { status: 405 });
  assertSameOrigin(request);
  const raw = await quizBody(request, 256);
  if (!raw.ok) return data(raw.reply, { status: raw.status });
  const b = Body.safeParse(raw.body);
  if (!b.success) return data(fail('invalid answer', 'invalid'), { status: 400 });
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const guest = guestId(request);
  if (!(await quizRate(sql, 'answer', { user, guest, ip: clientIp(request) }, 120, 60_000)))
    return data(fail('Slow down a little.', 'rate'), { status: 429 });
  const r = await answerQuestion(sql, b.data, { user, guest });
  return r.ok ? r : data(r, { status: 422 });
}
