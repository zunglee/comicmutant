import { data, redirect } from 'react-router';
import { checkPassword, currentUser, safeNext, startSession } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { allow, assertSameOrigin, clearBucket, clientIp, readForm } from '~/.server/guard';
import { AuthCard } from '~/components/auth-form';
import { PASSWORD_MAX } from '~/lib/community';
import type { Route } from './+types/login';

export const meta: Route.MetaFunction = () => [
  { title: 'Sign in — ComicMutant' },
  { name: 'robots', content: 'noindex' },
];

const WINDOW = 15 * 60_000;

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  if (await currentUser(await getSql(), request)) throw redirect(next);
  return { next };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const sql = await getSql();
  // Per-IP cap first (name-independent), so rotating names can't buy unlimited password hashes.
  if (!(await allow(sql, `login-ip:${clientIp(request)}`, 30, WINDOW))) {
    return data({ error: 'Too many tries from here. Wait 15 minutes.', name: '' }, { status: 429 });
  }
  const form = await readForm(request);
  const name = String(form.get('name') ?? '')
    .trim()
    .slice(0, 20);
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? '/'));
  const wrong = () => data({ error: 'Nickname or password is wrong.', name }, { status: 401 });
  if (!password || password.length > PASSWORD_MAX) return wrong();
  const bucket = `login:${clientIp(request)}:${name.toLowerCase()}`;
  if (!(await allow(sql, bucket, 8, WINDOW))) {
    return data({ error: 'Too many tries. Wait 15 minutes.', name }, { status: 429 });
  }
  const id = await checkPassword(sql, name, password);
  if (!id) return wrong();
  await clearBucket(sql, bucket, WINDOW);
  throw redirect(next, { headers: { 'Set-Cookie': await startSession(sql, id) } });
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <AuthCard
      mode="login"
      next={loaderData.next}
      error={actionData?.error}
      name={actionData?.name}
    />
  );
}
