/** Browser side of the Fact Frenzy API. Never throws: every failure comes back as `{ ok: false }`. */
import type {
  QuizAnswerBody,
  QuizAnswerReply,
  QuizClaimBody,
  QuizClaimReply,
  QuizErrorCode,
  QuizNextBody,
  QuizNextReply,
  QuizReportBody,
  QuizStartBody,
  QuizStartReply,
} from '~/lib/quiz-contract';

export interface Failure {
  ok: false;
  error: string;
  /** The request never got an answer (offline, timeout): safe to retry the same call. */
  network?: boolean;
  /** Why the server refused (absent for a dropped connection). */
  code?: QuizErrorCode;
}

export type ReportReply = { ok: true } | Failure;

const SLOW = 'Could not reach the server. Check your connection, then try again.';

/** Dev only: `?fixture=1` fakes the API in the browser. Dead code (and the import) in production. */
function fixtureOn(): boolean {
  return (
    import.meta.env.DEV &&
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('fixture') === '1'
  );
}

async function post<T>(url: string, body: unknown): Promise<T | Failure> {
  if (import.meta.env.DEV && fixtureOn()) {
    const f = await import('./fixture');
    return (await f.fakePost(url, body)) as T | Failure;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (json && typeof json === 'object' && typeof json.ok === 'boolean') return json as T;
    if (res.status === 429) {
      return { ok: false, error: 'Too many tries too fast. Wait a moment, then try again.' };
    }
    return { ok: false, error: 'The quiz server had a hiccup. Please try again.' };
  } catch {
    return { ok: false, error: SLOW, network: true };
  }
}

export const startGame = (b: QuizStartBody) => post<QuizStartReply>('/api/quiz/start', b);
export const sendAnswer = (b: QuizAnswerBody) => post<QuizAnswerReply>('/api/quiz/answer', b);
export const nextQuestion = (b: QuizNextBody) => post<QuizNextReply>('/api/quiz/next', b);
export const claimGame = (b: QuizClaimBody) => post<QuizClaimReply>('/api/quiz/claim', b);
export const reportFact = (b: QuizReportBody) => post<ReportReply>('/api/quiz/report', b);
