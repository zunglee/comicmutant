import { data } from 'react-router';
import { report } from '~/.server/community';
import { guardedPost, intField } from '~/.server/forms';
import type { Route } from './+types/report';

export async function action({ request }: Route.ActionArgs) {
  const { sql, user, form } = await guardedPost(request, 'report', 20, 3600_000);
  const take = intField(form, 'take');
  if (take === null) return data({ ok: false }, { status: 400 });
  // Ignored reports still answer ok, so reporters can't probe the trust rules.
  await report(sql, user.id, take);
  return { ok: true };
}
