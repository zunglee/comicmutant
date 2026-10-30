import { data, redirect } from 'react-router';
import {
  createUser,
  currentUser,
  safeNext,
  startSession,
  validName,
  validPassword,
} from '~/.server/auth';
import { getSql } from '~/.server/db';
import { allow, assertSameOrigin, clientIp, readForm } from '~/.server/guard';
import { AuthCard } from '~/components/auth-form';
import { PASSWORD_MAX, PASSWORD_MIN } from '~/lib/community';
import type { Route } from './+types/join';

export const meta: Route.MetaFunction = () => [
  { title: 'Join — ComicMutant' },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  if (await currentUser(await getSql(), request)) throw redirect(next);
  return { next };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const sql = await getSql();
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? '/'));
  if (!(await allow(sql, `join:${clientIp(request)}`, 5, 3600_000))) {
    return data(
      { error: 'Too many new accounts from here. Try again later.', name },
      { status: 429 },
    );
  }
  if (!validName(name)) {
    return data(
      { error: 'That nickname isn’t allowed. Use 3–20 letters, numbers or _.', name },
      { status: 400 },
    );
  }
  if (!validPassword(password)) {
    return data(
      { error: `Password: ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`, name },
      { status: 400 },
    );
  }
  const id = await createUser(sql, name, password, null);
  if (!id) return data({ error: 'That nickname is taken. Try another.', name }, { status: 409 });
  throw redirect(next, { headers: { 'Set-Cookie': await startSession(sql, id) } });
}

export default function Join({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <AuthCard
      mode="join"
      next={loaderData.next}
      error={actionData?.error}
      name={actionData?.name}
    />
  );
}
