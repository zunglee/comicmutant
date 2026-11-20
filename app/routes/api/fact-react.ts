/**
 * POST /api/fact-react {target, index, reaction} → FactReactReply (that fact's counts and the
 * caller's reaction). Same reaction again clears it; the other one switches. Counts only with an
 * existing voter — the guest cookie a page loader issued (ensureGuest) or, for desi facts, the fan
 * session — else 400 "reload" (S14). Sacred reactions are keyed by the cookie, never the fan (S12). Errors are LearnError {error, code}.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { getSql } from '~/.server/db';
import { clientIp } from '~/.server/guard';
import {
  checkFactTarget,
  ensureVoterHeaders,
  factCount,
  factReactions,
  isLearnError,
  LEARN_STATUS,
  learnFail,
  learnOrigin,
  learnRate,
  myFactReactions,
  NO_VOTER,
  reactFact,
  TARGET_RE,
  targetRealm,
  voterFor,
  voterOf,
} from '~/.server/polls';
import { quizBody } from '~/.server/quiz';
import type { Route } from './+types/fact-react';

/**
 * GET /api/fact-react?target=… → {target, counts, mine} for a whole deck, issuing voter cookies
 * like a page view, with `X-CM-Voter: 1|0` (S17 fallback: a widget whose POST said "reload" calls
 * this once, then retries). Unknown or malformed targets get the usual coded errors.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const target = new URL(request.url).searchParams.get('target') ?? '';
  if (!TARGET_RE.test(target) || target.length > 80)
    return data(learnFail('Which profile?', 'invalid'), { status: 400 });
  if (factCount(target) === null)
    return data(learnFail('No such profile.', 'unknown'), { status: 404 });
  const sql = await getSql();
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Cookie' });
  const realm = targetRealm(target);
  await ensureVoterHeaders(sql, request, headers, realm);
  const voter = await voterOf(sql, request, realm);
  return data(
    {
      target,
      counts: await factReactions(target, sql, voter),
      mine: await myFactReactions(target, voter, sql),
    },
    { headers },
  );
}

const Body = z.object({
  target: z.string().max(80),
  index: z.number().int().min(0).max(999),
  reaction: z.enum(['whoa', 'knew']),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data(learnFail('POST only', 'invalid'), { status: 405 });
  const cross = learnOrigin(request);
  if (cross) return data(cross, { status: 403 });
  const raw = await quizBody(request, 256);
  if (!raw.ok) return data(learnFail(raw.reply.error, 'invalid'), { status: raw.status });
  const b = Body.safeParse(raw.body);
  if (!b.success) return data(learnFail('Invalid reaction.', 'invalid'), { status: 400 });
  // Unknown profiles and facts are refused before a guest cookie is minted.
  const bad = checkFactTarget(b.data.target, b.data.index);
  if (bad) return data(bad, { status: LEARN_STATUS[bad.code] });
  const sql = await getSql();
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  const voter = await voterFor(sql, request, targetRealm(b.data.target));
  if (!voter) return data(NO_VOTER(), { status: 400, headers });
  const ip = clientIp(request);
  if (!(await learnRate(sql, 'fact', voter, ip)))
    return data(learnFail('Slow down a little.', 'rate'), { status: 429, headers });
  const r = await reactFact(sql, b.data, voter, ip);
  return isLearnError(r)
    ? data(r, { status: LEARN_STATUS[r.code], headers })
    : data(r, { headers });
}
