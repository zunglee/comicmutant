import { redirect } from 'react-router';
import { endSession } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { assertSameOrigin } from '~/.server/guard';
import type { Route } from './+types/logout';

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  await request.body?.cancel();
  throw redirect('/', { headers: { 'Set-Cookie': await endSession(await getSql(), request) } });
}

export const loader = () => redirect('/');
