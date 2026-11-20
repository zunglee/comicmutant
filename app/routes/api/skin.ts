/**
 * POST /api/skin {skin} → {ok, skin} and sets the `cm_skin` cookie (the picker's pinned choice,
 * read by SSR so the next page paints in it). {skin: null} or DELETE clears it, back to the section
 * defaults (reports/skins-design.md T4). Errors are {ok: false, error, code} with stable codes:
 * `invalid` (method, encoding, size, shape), `cross-site`, `unknown-skin`. A preference only: no
 * account, no database.
 *
 * No-JS fallback: a plain `<form method=post>` (urlencoded, `skin=<id>` or `skin=auto`) sets the same
 * cookie, then answers 303 back to the Referer's path (same-origin only, else `/`).
 */
import { data, redirect } from 'react-router';
import { ENV } from '~/.server/env';
import { siteOrigin } from '~/.server/guard';
import { quizBody } from '~/.server/quiz';
import { isSkinId, SKIN_COOKIE } from '~/skins/registry';
import type { SkinId } from '~/skins/types';
import type { Route } from './+types/skin';

export type SkinErrorCode = 'invalid' | 'cross-site' | 'unknown-skin';
export type SkinReply =
  | { ok: true; skin: SkinId | null }
  | { ok: false; error: string; code: SkinErrorCode };

const YEAR = 31536000;

const fail = (error: string, code: SkinErrorCode, status: number, headers?: Headers) =>
  data<SkinReply>({ ok: false, error, code }, { status, headers });

/** Origin (or Referer) must be this site; a cross-site Fetch Metadata hint refuses outright. */
function crossSite(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true;
  const from = request.headers.get('origin') ?? request.headers.get('referer');
  if (!from) return true;
  try {
    return new URL(from).origin !== siteOrigin(request);
  } catch {
    return true;
  }
}

function skinCookie(skin: SkinId | null): string {
  const secure = ENV.prod ? '; Secure' : '';
  return skin
    ? `${SKIN_COOKIE}=${skin}; Path=/; Max-Age=${YEAR}; SameSite=Lax${secure}`
    : `${SKIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Where a no-JS form post goes back to: the Referer's path on this site, never an external URL. */
function backTo(request: Request): string {
  try {
    const u = new URL(request.headers.get('referer') ?? '');
    if (u.origin === siteOrigin(request)) return `${u.pathname}${u.search}`;
  } catch {
    // no or bad Referer
  }
  return '/';
}

const FORM_MAX = 2048;

/** Reads the urlencoded body with a hard cap (content-length first, then while streaming). */
async function readCapped(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > FORM_MAX) return null;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > FORM_MAX) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function formAction(request: Request, headers: Headers) {
  const text = await readCapped(request);
  if (text === null) return fail('Request too large.', 'invalid', 413, headers);
  const form = new URLSearchParams(text);
  const v = form.get('skin');
  if (typeof v !== 'string' || (v !== 'auto' && v !== '' && !isSkinId(v)))
    return fail('No such skin.', 'unknown-skin', 400, headers);
  headers.append('Set-Cookie', skinCookie(isSkinId(v) ? v : null));
  return redirect(backTo(request), { status: 303, headers });
}

export async function action({ request }: Route.ActionArgs) {
  const method = request.method.toUpperCase();
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (method !== 'POST' && method !== 'DELETE')
    return fail('POST or DELETE only.', 'invalid', 405, headers);
  if (crossSite(request)) return fail('Cross-site request refused.', 'cross-site', 403, headers);
  let skin: SkinId | null = null;
  if (
    method === 'POST' &&
    (request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded')
  )
    return formAction(request, headers);
  if (method === 'POST') {
    const raw = await quizBody(request, 128);
    if (!raw.ok) return fail(raw.reply.error, 'invalid', raw.status, headers);
    const body = raw.body as { skin?: unknown } | null;
    if (!body || typeof body !== 'object' || !('skin' in body))
      return fail('Which skin?', 'invalid', 400, headers);
    if (body.skin !== null && !isSkinId(body.skin))
      return fail('No such skin.', 'unknown-skin', 400, headers);
    skin = body.skin;
  }
  headers.append('Set-Cookie', skinCookie(skin));
  return data<SkinReply>({ ok: true, skin }, { headers });
}
