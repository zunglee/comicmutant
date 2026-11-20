/**
 * GET /api/poll?id=… → PollView (with the caller's choice), issuing voter cookies like a page view
 * and an `X-CM-Voter: 1|0` header (0 = the mint ceiling withheld them; S17 fallback for widgets). POST /api/poll {id, option} → PollView
 * after voting. GET issues the guest cookie when missing (never IP-gated); a POST counts only with
 * an existing voter — fan session (desi) or that cookie — else 400 "reload" (S14). Sacred polls
 * always vote as the browser cookie, never as the signed-in fan (S12). Errors
 * are LearnError {error, code} (app/components/learn/contract.ts).
 */
import { data } from 'react-router';
import { z } from 'zod';
import { getSql } from '~/.server/db';
import { clientIp } from '~/.server/guard';
import {
  castVote,
  ensureVoterHeaders,
  getPoll,
  isLearnError,
  LEARN_STATUS,
  learnFail,
  learnOrigin,
  learnRate,
  NO_VOTER,
  pollView,
  voterFor,
} from '~/.server/polls';
import { quizBody } from '~/.server/quiz';
import type { Route } from './+types/poll';

const Id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(60);
const Body = z.object({ id: Id, option: Id });
/** The reply names the caller's own vote, so it is never shared from a cache. */
const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function loader({ request }: Route.LoaderArgs) {
  const id = Id.safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success) return data(learnFail('Which poll?', 'invalid'), { status: 400 });
  const poll = getPoll(id.data);
  if (!poll) return data(learnFail('No such poll.', 'unknown'), { status: 404 });
  // Showing a poll issues the guest cookie a later vote needs (S14).
  const headers = new Headers(PRIVATE);
  const sql = await getSql();
  await ensureVoterHeaders(sql, request, headers, poll.realm);
  const v = await pollView(id.data, request, sql);
  return data(v, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data(learnFail('POST only', 'invalid'), { status: 405 });
  const cross = learnOrigin(request);
  if (cross) return data(cross, { status: 403 });
  const raw = await quizBody(request, 256);
  if (!raw.ok) return data(learnFail(raw.reply.error, 'invalid'), { status: raw.status });
  const b = Body.safeParse(raw.body);
  if (!b.success) return data(learnFail('Invalid vote.', 'invalid'), { status: 400 });
  const sql = await getSql();
  // Unknown polls, closed polls and unknown options are refused before a guest cookie is minted.
  const poll = getPoll(b.data.id);
  if (!poll) return data(learnFail('No such poll.', 'unknown'), { status: 404 });
  if (poll.closed) return data(learnFail('This poll has closed.', 'closed'), { status: 409 });
  if (!poll.options.some((o) => o.id === b.data.option))
    return data(learnFail('No such option.', 'invalid'), { status: 400 });
  const headers = new Headers(PRIVATE);
  const voter = await voterFor(sql, request, poll.realm);
  if (!voter) return data(NO_VOTER(), { status: 400, headers });
  const ip = clientIp(request);
  if (!(await learnRate(sql, 'poll', voter, ip)))
    return data(learnFail('Slow down a little.', 'rate'), { status: 429, headers });
  const r = await castVote(sql, b.data, voter, ip);
  return isLearnError(r)
    ? data(r, { status: LEARN_STATUS[r.code], headers })
    : data(r, { headers });
}
