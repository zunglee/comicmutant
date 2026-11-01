import { useEffect } from 'react';
import { Form, Link, redirect } from 'react-router';
import { requireMod } from '~/.server/auth';
import { modQueue, modRule } from '~/.server/community';
import { getSql } from '~/.server/db';
import { QUEUE_PAGE, rejectPlayer, reviewQueue, ruleRun } from '~/.server/freefall';
import { assertSameOrigin, readForm } from '~/.server/guard';
import { SectionHead } from '~/components/bits';
import type { Route } from './+types/mod';

export const meta: Route.MetaFunction = () => [
  { title: 'Moderation — ComicMutant' },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }: Route.LoaderArgs) {
  const sql = await getSql();
  await requireMod(sql, request);
  const url = new URL(request.url);
  const page = Math.max(0, Number(url.searchParams.get('page')) || 0);
  return {
    queue: await modQueue(sql),
    runs: await reviewQueue(sql, page),
    page,
    perPage: QUEUE_PAGE,
    done: url.searchParams.get('done'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const sql = await getSql();
  const mod = await requireMod(sql, request);
  const run = Number(form.get('run'));
  const call = form.get('call');
  const player = Number(form.get('player'));
  if (call === 'reject-player' && Number.isInteger(player)) {
    await rejectPlayer(sql, player);
    throw redirect('/mod?done=rejected-all');
  }
  if (Number.isInteger(run) && (call === 'approve' || call === 'reject')) {
    await ruleRun(sql, run, call === 'approve');
    // A fresh page with this action's message (not a stale one from the URL).
    throw redirect(`/mod?done=${call === 'approve' ? 'approved' : 'rejected'}`);
  }
  const id = Number(form.get('take'));
  const ruling = form.get('ruling');
  if (Number.isInteger(id) && (ruling === 'restore' || ruling === 'hide' || ruling === 'ban')) {
    const error = await modRule(sql, mod.id, id, ruling);
    if (error) return { ok: false, error };
  }
  return { ok: true };
}

export default function Mod({ loaderData, actionData }: Route.ComponentProps) {
  // The floating theme dock would sit over the queue's buttons and the replay.
  useEffect(() => {
    document.documentElement.setAttribute('data-no-dock', '');
    return () => document.documentElement.removeAttribute('data-no-dock');
  }, []);
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 pb-28">
      <SectionHead level={1} kicker="Mods only" title="Report queue" />
      {actionData && !actionData.ok && (
        <p role="alert" className="bubble mb-4">
          {actionData.error}
        </p>
      )}
      {loaderData.queue.length === 0 && (
        <p className="bubble">Queue is empty. The multiverse is behaving.</p>
      )}
      <ul className="space-y-4">
        {loaderData.queue.map((t) => (
          <li key={t.id} className="panel space-y-3 p-4">
            <p className="text-muted text-xs">
              {t.author} · {t.target} · {t.reports} report(s) · {t.hidden ? 'hidden' : 'visible'}
            </p>
            <p>{t.body}</p>
            <Form method="post" className="flex flex-wrap gap-2">
              <input type="hidden" name="take" value={t.id} />
              <button className="btn btn-sm" name="ruling" value="restore" type="submit">
                Restore
              </button>
              <button className="btn btn-sm" name="ruling" value="hide" type="submit">
                Keep hidden
              </button>
              <button
                className="btn btn-sm btn-c1"
                name="ruling"
                value="ban"
                type="submit"
                onClick={(e) => {
                  if (!confirm(`Ban ${t.author}? Their takes disappear and they are signed out.`))
                    e.preventDefault();
                }}
              >
                Ban author
              </button>
            </Form>
          </li>
        ))}
      </ul>

      <div className="mt-12">
        <SectionHead kicker="Held before the board" title="Freefall runs to check" />
      </div>
      {loaderData.done && (
        <p role="status" className="bubble mb-4">
          {loaderData.done === 'approved'
            ? 'Run approved — its name is up.'
            : loaderData.done === 'rejected-all'
              ? "Every run by that player rejected — they're off the boards."
              : 'Run rejected.'}
        </p>
      )}
      <p className="mb-2 text-muted text-sm">
        {loaderData.runs.total} waiting · biggest run first (approving one also clears that player's
        runs up to 30% above it at that class).
      </p>
      {loaderData.runs.rows.length === 0 ? (
        <p className="bubble">No runs waiting.</p>
      ) : (
        <ul className="space-y-3">
          {loaderData.runs.rows.map((r) => (
            <li key={r.id} className="panel flex flex-wrap items-center gap-3 p-4">
              <p className="flex-1 text-sm">
                <b>{r.name}</b> · {r.mode} {r.level} {r.day} · {r.score.toLocaleString('en-IN')} pts
                · {r.correct}/{r.asked} sums · {r.hits} rubble {r.hits === 1 ? 'hit' : 'hits'} ·{' '}
                {r.saved}/{r.people} saved · {r.pauses} pauses ({Math.round(r.pause_ms / 1000)} s) ·{' '}
                {Math.round(r.steps / 60)} s · pace {r.pace ? `${r.pace.toFixed(2)}×` : '—'} ·
                checked best{' '}
                {r.checked_best
                  ? `${r.checked_best.toLocaleString('en-IN')} (+${Math.round((r.score / r.checked_best - 1) * 100)}%)`
                  : 'none yet'}
                <span className="block text-muted">Why it's here: {r.reasons ?? '—'}</span>
              </p>
              {r.has_log ? (
                <Link to={`/mod/freefall/${r.id}`} className="btn btn-sm">
                  Watch replay
                </Link>
              ) : (
                <span className="text-muted text-xs">no replay stored</span>
              )}
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="run" value={r.id} />
                <button className="btn btn-sm" name="call" value="approve" type="submit">
                  Approve
                </button>
                <button className="btn btn-sm btn-c1" name="call" value="reject" type="submit">
                  Reject
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="player" value={r.user_id} />
                <button
                  className="btn btn-sm"
                  name="call"
                  value="reject-player"
                  type="submit"
                  onClick={(e) => {
                    if (!confirm(`Reject every Freefall run by ${r.name}, approved ones too?`))
                      e.preventDefault();
                  }}
                >
                  Reject all by {r.name}
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Queue pages" className="mt-4 flex gap-2">
        {loaderData.page > 0 && (
          <Link to={`?page=${loaderData.page - 1}`} className="btn btn-sm">
            ← Newer page
          </Link>
        )}
        {(loaderData.page + 1) * loaderData.perPage < loaderData.runs.total && (
          <Link to={`?page=${loaderData.page + 1}`} className="btn btn-sm">
            Next page →
          </Link>
        )}
      </nav>
    </div>
  );
}
