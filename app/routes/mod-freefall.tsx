/** /mod/freefall/:id — mods only: watch a held Freefall run exactly as the server scored it. */
import { lazy, Suspense, useEffect, useState } from 'react';
import { data, Form, Link, redirect } from 'react-router';
import { requireMod } from '~/.server/auth';
import { allFighters } from '~/.server/content';
import { getSql } from '~/.server/db';
import { heldRun, ruleRun } from '~/.server/freefall';
import { assertSameOrigin, readForm } from '~/.server/guard';
import { SectionHead } from '~/components/bits';
import { LEVEL_LABEL } from '~/game/freefall/maths';
import type { Route } from './+types/mod-freefall';

const ReplayViewer = lazy(() => import('~/game/freefall/ReplayViewer'));

export const meta: Route.MetaFunction = () => [
  { title: 'Freefall replay — ComicMutant mods' },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const sql = await getSql();
  await requireMod(sql, request);
  const run = await heldRun(sql, Number(params.id));
  if (!run) throw data('No replay for that run.', { status: 404 });
  const hero = allFighters().find((f) => f.kind !== 'villain');
  if (!hero) throw data('No hero to draw.', { status: 500 });
  return { run: { ...run, log: JSON.parse(run.log) as number[] }, hero };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const sql = await getSql();
  await requireMod(sql, request);
  const call = form.get('call');
  if (call !== 'approve' && call !== 'reject') return { ok: false };
  await ruleRun(sql, Number(params.id), call === 'approve');
  // Back to the queue: this run is no longer reviewable here.
  throw redirect(`/mod?done=${call === 'approve' ? 'approved' : 'rejected'}`);
}

export default function ModFreefall({ loaderData: d, actionData }: Route.ComponentProps) {
  // The floating theme dock would sit over the queue's buttons and the replay.
  useEffect(() => {
    document.documentElement.setAttribute('data-no-dock', '');
    return () => document.documentElement.removeAttribute('data-no-dock');
  }, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const r = d.run;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-28">
      <Link to="/mod" className="kicker inline-flex min-h-11 items-center hover:underline">
        ← Mod queue
      </Link>
      <SectionHead
        level={1}
        kicker={`${r.name} · ${LEVEL_LABEL[r.level]} · ${r.score.toLocaleString('en-IN')} pts`}
        title="Run replay"
      />
      <p className="bubble mb-4 text-sm">
        Why it's here: {r.reasons ?? '—'} · wall-clock pace {r.pace ? `${r.pace.toFixed(2)}×` : '—'}{' '}
        (1.00× = played in real time; pauses counted)
      </p>
      {mounted && (
        <Suspense fallback={<p className="kicker">Loading replay…</p>}>
          <ReplayViewer hero={d.hero} level={r.level} seed={r.seed} qseed={r.qseed} log={r.log} />
        </Suspense>
      )}
      <p className="mt-4 text-muted text-sm">
        Look for what people don't do: lining up on the right hole the instant a sum appears, never
        touching rubble at speed, sweeping up everyone in the shaft.
      </p>
      {actionData && !actionData.ok && (
        <p role="alert" className="bubble mt-4">
          Pick Approve or Reject.
        </p>
      )}
      {(r.review === 0 || r.review === 1) && (
        <Form method="post" className="mt-4 flex gap-2">
          <button className="btn" name="call" value="approve" type="submit">
            Approve
          </button>
          <button className="btn btn-c1" name="call" value="reject" type="submit">
            Reject
          </button>
        </Form>
      )}
    </div>
  );
}
