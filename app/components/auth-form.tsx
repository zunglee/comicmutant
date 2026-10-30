/** Shared sign-in / join card. */
import { useEffect, useRef, useState } from 'react';
import { Form, Link, useNavigation } from 'react-router';
import { PASSWORD_MIN } from '~/lib/community';
import { Logo } from './chrome';

export function AuthCard({
  mode,
  error,
  next,
  name,
}: {
  mode: 'login' | 'join';
  error?: string;
  next: string;
  name?: string;
}) {
  const busy = useNavigation().state === 'submitting';
  const join = mode === 'join';
  const [showPw, setShowPw] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // After a failed submit, focus lands on the error (not the page body), which sits above the fields.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const invalid = error ? true : undefined;
  const describe = (id?: string) =>
    [error && 'auth-error', id].filter(Boolean).join(' ') || undefined;
  return (
    <div className="mx-auto grid min-h-[75vh] max-w-md place-items-center px-4 py-12">
      <div className="panel halftone tilt-l w-full space-y-5 p-6 sm:p-8">
        <Logo />
        <h1 className="h-display ink-text text-5xl text-c1-text-card">
          {join ? 'Get a nickname' : 'Welcome back'}
        </h1>
        <p className="text-sm">
          {join
            ? 'No email, no real name. Pick a nickname and a password to post takes, react and vote.'
            : 'Sign in with your nickname.'}
        </p>
        <Form method="post" className="space-y-4" noValidate={false}>
          <input type="hidden" name="next" value={next} />
          {error && (
            <p
              ref={errorRef}
              id="auth-error"
              role="alert"
              tabIndex={-1}
              className="bubble text-sm font-semibold outline-none"
            >
              {error}
            </p>
          )}
          <label className="block space-y-1">
            <span className="kicker block text-card-fg!">Nickname</span>
            <input
              name="name"
              required
              autoComplete="username"
              pattern="[A-Za-z0-9_]{3,20}"
              minLength={3}
              maxLength={20}
              defaultValue={name}
              aria-invalid={invalid}
              aria-describedby={describe('name-help')}
              className="field"
            />
            <span id="name-help" className="block text-muted text-xs">
              3–20 letters, numbers or _
            </span>
          </label>
          <div className="space-y-1">
            <label htmlFor="auth-pw" className="kicker block text-card-fg!">
              Password
            </label>
            <span className="relative block">
              <input
                id="auth-pw"
                name="password"
                type={showPw ? 'text' : 'password'}
                required
                minLength={join ? PASSWORD_MIN : 1}
                autoComplete={join ? 'new-password' : 'current-password'}
                aria-invalid={invalid}
                aria-describedby={describe(join ? 'pw-help' : undefined)}
                className="field pr-20"
              />
              <button
                type="button"
                className="btn btn-sm absolute top-1/2 right-1.5 -translate-y-1/2"
                aria-pressed={showPw}
                aria-label="Show password"
                onClick={() => setShowPw((v) => !v)}
              >
                Show
              </button>
            </span>
            {join && (
              <span id="pw-help" className="block text-muted text-xs">
                At least {PASSWORD_MIN} characters. A short phrase works great.
              </span>
            )}
          </div>
          <button type="submit" className="btn btn-c1 w-full" disabled={busy}>
            {busy ? 'One sec…' : join ? 'Create & sign in' : 'Sign in'}
          </button>
        </Form>
        <p className="text-center text-sm">
          {join ? 'Already have one? ' : 'New here? '}
          <Link
            to={`/${join ? 'login' : 'join'}?next=${encodeURIComponent(next)}`}
            className="font-semibold underline"
          >
            {join ? 'Sign in' : 'Get a nickname'}
          </Link>
        </p>
      </div>
    </div>
  );
}
