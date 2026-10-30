import { Form } from 'react-router';
import { requireMod } from '~/.server/auth';
import { modQueue, modRule } from '~/.server/community';
import { getSql } from '~/.server/db';
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
  return { queue: await modQueue(sql) };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const sql = await getSql();
  const mod = await requireMod(sql, request);
  const id = Number(form.get('take'));
  const ruling = form.get('ruling');
  if (Number.isInteger(id) && (ruling === 'restore' || ruling === 'hide' || ruling === 'ban')) {
    const error = await modRule(sql, mod.id, id, ruling);
    if (error) return { ok: false, error };
  }
  return { ok: true };
}

export default function Mod({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
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
    </div>
  );
}
