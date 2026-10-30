import { data } from 'react-router';
import { currentUser } from '~/.server/auth';
import { listTakes } from '~/.server/community';
import { getSql } from '~/.server/db';
import type { Route } from './+types/takes';

/** Older takes for "Load older": keyset-paged by id. */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const target = url.searchParams.get('target') ?? '';
  if (!/^(c:[a-z0-9-]{1,60}|v:[1-9]\d{0,11})$/.test(target))
    throw data('bad target', { status: 400 });
  const before = Number(url.searchParams.get('before'));
  const sideRaw = url.searchParams.get('side');
  const side = sideRaw === 'a' || sideRaw === 'b' ? sideRaw : undefined;
  const sql = await getSql();
  const user = await currentUser(sql, request);
  return {
    takes: await listTakes(sql, target, user?.id ?? null, {
      side,
      before: Number.isInteger(before) && before > 0 ? before : undefined,
    }),
  };
}
