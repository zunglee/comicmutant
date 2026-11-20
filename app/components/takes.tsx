/**
 * Hot takes: short opinions shown as speech bubbles, reacted to with sound-effect stickers.
 * Not a thread tree on purpose — one line each, fast to read, fun to react to.
 */
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useLocation } from 'react-router';
import { REACTIONS, TAKE_MAX } from '~/lib/community';
import { IconFlag } from './icons';
import { Button, Textarea } from './ui';

export interface Take {
  id: number;
  body: string;
  side: 'a' | 'b' | null;
  created_at: string;
  author: string;
  role: 'fan' | 'mod';
  reactions: Partial<Record<string, number>>;
  mine: string | null;
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function TakeComposer({
  target,
  side,
  signedIn,
  placeholder = 'Drop your hot take…',
}: {
  target: string;
  side?: 'a' | 'b';
  signedIn: boolean;
  placeholder?: string;
}) {
  const f = useFetcher<{ ok: boolean; error?: string }>();
  const loc = useLocation();
  const ref = useRef<HTMLFormElement>(null);
  const [len, setLen] = useState(0);
  useEffect(() => {
    if (f.state === 'idle' && f.data?.ok) {
      ref.current?.reset();
      setLen(0);
    }
  }, [f.state, f.data]);
  if (!signedIn) {
    return (
      <p className="bubble text-sm">
        <Link
          to={`/login?next=${encodeURIComponent(loc.pathname)}`}
          className="font-semibold underline"
        >
          Sign in
        </Link>{' '}
        or{' '}
        <Link
          to={`/join?next=${encodeURIComponent(loc.pathname)}`}
          className="font-semibold underline"
        >
          grab a nickname
        </Link>{' '}
        to drop a take. Takes 10 seconds, no email.
      </p>
    );
  }
  const id = `take-${target}-${side ?? 'x'}`;
  return (
    <f.Form method="post" action="/api/take" ref={ref} className="space-y-2">
      <input type="hidden" name="target" value={target} />
      {side && <input type="hidden" name="side" value={side} />}
      <label htmlFor={id} className="kicker block">
        Your take
      </label>
      <Textarea
        id={id}
        name="body"
        required
        minLength={3}
        maxLength={TAKE_MAX}
        rows={2}
        placeholder={placeholder}
        onChange={(e) => setLen(e.target.value.length)}
        aria-describedby={`${id}-help`}
        className="resize-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p
          id={`${id}-help`}
          className={`text-xs ${f.data?.error ? 'font-semibold text-c1-text' : 'text-muted'}`}
          aria-live="polite"
        >
          {f.data?.error ?? `${TAKE_MAX - len} left · no links · be fun, not cruel`}
        </p>
        <Button type="submit" variant="c1" size="sm" disabled={f.state !== 'idle'}>
          {f.state === 'idle' ? 'Post it' : 'Posting…'}
        </Button>
      </div>
    </f.Form>
  );
}

export function TakeList({
  takes,
  signedIn,
  tint,
  target,
  side,
  pageSize = 30,
}: {
  takes: Take[];
  signedIn: boolean;
  tint?: (t: Take) => string;
  target: string;
  side?: 'a' | 'b';
  pageSize?: number;
}) {
  // Older pages are fetched by id cursor and appended; the newest page comes from the loader.
  const older = useFetcher<{ takes: Take[] }>();
  const [extra, setExtra] = useState<Take[]>([]);
  const [done, setDone] = useState(takes.length < pageSize);
  useEffect(() => {
    if (older.state !== 'idle' || !older.data) return;
    const got = older.data.takes;
    setExtra((x) => [...x, ...got.filter((t) => !x.some((y) => y.id === t.id))]);
    if (got.length < pageSize) setDone(true);
  }, [older.state, older.data, pageSize]);
  const all = [...takes, ...extra.filter((t) => !takes.some((y) => y.id === t.id))];
  if (!all.length) {
    return <p className="text-muted text-sm">No takes yet. Be the first loud voice.</p>;
  }
  const last = all[all.length - 1];
  return (
    <div className="space-y-5">
      <ul className="space-y-5">
        <AnimatePresence initial={false}>
          {all.map((t, i) => (
            <m.li
              key={t.id}
              initial={{ scale: 0.8, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 24 }}
              className={i % 2 ? 'pl-6' : 'pr-6'}
            >
              <TakeBubble take={t} signedIn={signedIn} tint={tint?.(t)} />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
      {!done && last && (
        <Button
          size="sm"
          disabled={older.state !== 'idle'}
          onClick={() =>
            older.load(
              `/api/takes?${new URLSearchParams({ target, before: String(last.id), ...(side ? { side } : {}) })}`,
            )
          }
        >
          {older.state === 'idle' ? 'Load older takes' : 'Loading…'}
        </Button>
      )}
    </div>
  );
}

function TakeBubble({ take, signedIn, tint }: { take: Take; signedIn: boolean; tint?: string }) {
  const rx = useFetcher();
  const rep = useFetcher<{ ok: boolean }>();
  // Optimistic reaction: show the pending choice before the server answers.
  const pending = rx.formData?.get('kind')?.toString();
  const mine = pending ? (pending === take.mine ? null : pending) : take.mine;
  return (
    <article
      className="bubble"
      style={
        tint
          ? {
              borderColor: tint,
              boxShadow: `calc(var(--shadow-x) * 0.8) calc(var(--shadow-y) * 0.8) var(--shadow-blur) ${tint}`,
            }
          : undefined
      }
    >
      <header className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-head uppercase">
          {take.author}
          {take.role === 'mod' && (
            <span className="ml-1.5 rounded-skin-s border-skin-s border-ink bg-pop px-1 text-xs">
              MOD
            </span>
          )}
        </span>
        <time dateTime={take.created_at} className="opacity-70">
          {ago(take.created_at)}
        </time>
      </header>
      <p className="text-base leading-snug">{take.body}</p>
      <footer className="mt-2 flex flex-wrap items-center gap-1.5">
        {REACTIONS.map((r) => {
          const base = take.reactions[r.id] ?? 0;
          const n = base + (mine === r.id ? 1 : 0) - (take.mine === r.id ? 1 : 0);
          return (
            <rx.Form key={r.id} method="post" action="/api/react">
              <input type="hidden" name="take" value={take.id} />
              <input type="hidden" name="kind" value={r.id} />
              <button
                type="submit"
                disabled={!signedIn}
                title={signedIn ? r.hint : 'Sign in to react'}
                aria-pressed={mine === r.id}
                aria-label={`${r.label}${n > 0 ? ` ${n}` : ''}, ${r.hint}`}
                className={`rounded-skin-pill border-skin-s border-ink px-2 py-0.5 font-display text-sm tracking-wide transition-transform hover:tilt-skin-3 hover:scale-110 disabled:cursor-not-allowed disabled:hover:transform-none ${
                  mine === r.id ? 'bg-pop text-ink' : 'bg-paper text-ink'
                }`}
              >
                {r.label}
                {n > 0 && <span className="ml-1 font-body font-semibold text-xs">{n}</span>}
              </button>
            </rx.Form>
          );
        })}
        {signedIn && (
          <rep.Form method="post" action="/api/report" className="ml-auto">
            <input type="hidden" name="take" value={take.id} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1 rounded-skin-s px-1.5 text-paper-muted text-xs hover:text-alert"
              disabled={rep.state !== 'idle' || rep.data?.ok}
              aria-label="Report this take"
            >
              <IconFlag className="size-3.5" />
              {rep.data?.ok ? 'Reported' : 'Report'}
            </button>
          </rep.Form>
        )}
      </footer>
    </article>
  );
}
