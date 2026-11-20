/** The two learn endpoints, one place each, so the optimistic widgets and their tests share it. */
import type {
  FactReactBody,
  FactReactReply,
  LearnError,
  LearnErrorCode,
  PollView,
} from '../contract';

export type NetResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: LearnErrorCode; reload?: boolean; ceiling?: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<NetResult<T>> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as LearnError | null;
      // The server asks for a page reload when the browser has no voter cookie from a page view yet.
      const reload = err?.code === 'invalid' && /reload/i.test(err.error ?? '');
      return { ok: false, code: err?.code ?? 'other', reload };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, code: 'other' };
  }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * S17 self-heal: a POST refused with "please reload" (no voter cookie yet) calls the matching GET once,
 * which mints the cookies and answers `X-CM-Voter: 1` (can vote now) or `0` (cookie ceiling hit).
 * On 1 the POST is retried once; on 0 the caller reverts and says "try again in a few minutes".
 */
async function healed<T>(
  send: () => Promise<NetResult<T>>,
  healUrl: string,
): Promise<NetResult<T>> {
  const first = await send();
  if (first.ok || !first.reload) return first;
  let voter: string | null;
  try {
    voter = (await fetch(healUrl)).headers.get('X-CM-Voter');
  } catch {
    return first;
  }
  if (voter === '0') return { ok: false, code: 'invalid', ceiling: true };
  if (voter !== '1') return first;
  const second = await send();
  return second.ok ? second : { ...second, reload: true };
}

export const postFactReact = (b: FactReactBody) =>
  healed(
    () => call<FactReactReply>('/api/fact-react', post(b)),
    `/api/fact-react?target=${encodeURIComponent(b.target)}`,
  );
export const getPoll = (id: string) => call<PollView>(`/api/poll?id=${encodeURIComponent(id)}`);
export const postVote = (id: string, option: string) =>
  healed(
    () => call<PollView>('/api/poll', post({ id, option })),
    `/api/poll?id=${encodeURIComponent(id)}`,
  );

export const NOTICE: Record<string, string> = {
  rate: 'Easy there, take a moment and try again.',
  closed: 'Reactions and polls are resting right now.',
  invalid: "That one didn't go through.",
  unknown: "We can't find that any more.",
  other: "That didn't save. Try again in a moment.",
  reload: 'Please reload and try again.',
  ceiling: 'Try again in a few minutes.',
};
