import { data } from 'react-router';
import { react } from '~/.server/community';
import { guardedPost, intField } from '~/.server/forms';
import type { Route } from './+types/react';

export async function action({ request }: Route.ActionArgs) {
  const { sql, user, form } = await guardedPost(request, 'react', 60, 60_000);
  const take = intField(form, 'take');
  const ok = take !== null && (await react(sql, user.id, take, String(form.get('kind'))));
  return ok ? { ok: true } : data({ ok: false }, { status: 400 });
}
