import { data } from 'react-router';
import { addTake, checkTake, versusExists } from '~/.server/community';
import { getCharacter } from '~/.server/content';
import { guardedPost } from '~/.server/forms';
import type { Route } from './+types/take';

export async function action({ request }: Route.ActionArgs) {
  const { sql, user, form } = await guardedPost(request, 'take', 6, 60_000);
  const raw = form.get('target') ?? '';
  const sideRaw = form.get('side');
  const side = sideRaw === 'a' || sideRaw === 'b' ? sideRaw : null;
  // Targets are re-built from validated parts, never stored as submitted.
  let target: string;
  const c = /^c:([a-z0-9-]{1,60})$/.exec(raw);
  const v = /^v:([1-9]\d{0,11})$/.exec(raw);
  if (c?.[1] && getCharacter(c[1])) target = `c:${c[1]}`;
  else if (v?.[1] && (await versusExists(sql, Number(v[1])))) {
    if (!side) return data({ ok: false, error: 'Pick a side first.' }, { status: 400 });
    target = `v:${Number(v[1])}`;
  } else return data({ ok: false, error: 'Unknown target.' }, { status: 400 });
  const check = checkTake(form.get('body'));
  if (!check.ok) return data({ ok: false, error: check.error }, { status: 400 });
  await addTake(sql, user.id, target, check.body, target.startsWith('v:') ? side : null);
  return { ok: true };
}
