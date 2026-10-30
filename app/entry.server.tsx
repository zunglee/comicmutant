import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import type { EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';
import { randomToken } from '~/.server/guard';
import { NonceContext } from '~/lib/nonce';

export const streamTimeout = 5_000;

const prod = process.env.NODE_ENV === 'production';

/**
 * Production-only CSP: dev needs Vite's websocket and inline HMR. Scripts need a per-request
 * nonce (the router's inline hydration data carries it); inline style attributes stay allowed.
 */
function csp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function secure(headers: Headers) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), gamepad=(self)');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (prod) headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/** `.data` responses and resource routes get the same baseline headers as documents. */
export function handleDataRequest(response: Response, { request }: { request: Request }) {
  secure(response.headers);
  // Same cache policy as documents, so a CDN can serve anonymous client navigations too.
  cachePolicy(request, response.headers, response.status);
  return response;
}

/**
 * Anonymous GET pages can be shared by caches for a minute (personalisation is only cookies, so
 * `Vary: Cookie` keys it); anything with a session or a write is private.
 */
function cachePolicy(request: Request, headers: Headers, status: number) {
  if (headers.has('Cache-Control')) return;
  const cookie = request.headers.get('cookie') ?? '';
  const anon = !/(^|;\s*)(__Host-)?cm_session=/.test(cookie);
  if (request.method === 'GET' && status === 200 && anon) {
    headers.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
    headers.append('Vary', 'Cookie');
  } else {
    headers.set('Cache-Control', 'private, no-store');
  }
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  secure(responseHeaders);
  cachePolicy(request, responseHeaders, responseStatusCode);
  const nonce = randomToken(16);
  if (prod) responseHeaders.set('Content-Security-Policy', csp(nonce));
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <NonceContext.Provider value={nonce}>
        <ServerRouter context={routerContext} url={request.url} nonce={nonce} />
      </NonceContext.Provider>,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set('Content-Type', 'text/html');
          pipe(body);
          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
  });
}
