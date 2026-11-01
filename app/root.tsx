import '@fontsource/bangers/latin-400';
import '@fontsource/russo-one/latin-400';
import '@fontsource/chakra-petch/latin-400';
import '@fontsource/chakra-petch/latin-600';
import './app.css';

import bangers400 from '@fontsource/bangers/files/bangers-latin-400-normal.woff2?url';
import chakra400 from '@fontsource/chakra-petch/files/chakra-petch-latin-400-normal.woff2?url';
import russo400 from '@fontsource/russo-one/files/russo-one-latin-400-normal.woff2?url';
import { isbot } from 'isbot';
import { LazyMotion, MotionConfig } from 'motion/react';
import { type ReactNode, useContext, useEffect, useRef } from 'react';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteLoaderData,
} from 'react-router';
import { currentUser, readCookie } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { readThemeState } from '~/.server/themes';
import { Atmosphere } from '~/components/atmosphere';
import { Footer, Header, MobileTabs, OfflineBanner, ThemeDock } from '~/components/chrome';
import { EasterEggs } from '~/components/eggs';
import { LoaderStage } from '~/components/loaders';
import { FX_COOKIE, type Fx, FxProvider } from '~/lib/fx';
import { NonceContext } from '~/lib/nonce';
import { varsToStyle } from '~/lib/theme/compute';
import { ThemeProvider } from '~/lib/theme/context';
import type { Route } from './+types/root';

/** Animation features arrive in their own chunk; `m.*` components render static until then. */
const loadMotionFeatures = () => import('~/lib/motion-features').then((r) => r.default);

export async function loader({ request }: Route.LoaderArgs) {
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const { current, top5 } = readThemeState(request);
  const fx: Fx = readCookie(request, FX_COOKIE) === 'lite' ? 'lite' : 'rich';
  // First page of a session plays the intro (never for bots or Lite FX).
  const playIntro =
    fx === 'rich' &&
    !readCookie(request, 'cm_seen') &&
    !isbot(request.headers.get('user-agent') ?? '');
  return {
    theme: current,
    top5,
    fx,
    playIntro,
    user: user && { name: user.name, role: user.role },
  };
}

/**
 * The root loader (user, theme, dock) only changes on sign-in/out; votes, takes and reactions
 * never touch it, so skip re-running it after those posts.
 */
export function shouldRevalidate({ formAction, formMethod }: ShouldRevalidateFunctionArgs) {
  // Theme and dock are client-owned after hydration; only sign-in/out (and mod rulings) change root data.
  if (!formMethod || formMethod.toUpperCase() === 'GET') return false;
  // Compare paths: a sign-in from a game posts to /login?next=…, and must still refresh the header.
  const path = formAction ? new URL(formAction, 'http://comicmutant.invalid').pathname : '';
  return path === '/login' || path === '/join' || path === '/logout' || path.startsWith('/mod');
}

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  // The faces above the fold on every page (Russo One sets the kicker and button text: a late swap
  // re-centred character heroes, CLS 0.26).
  ...[bangers400, russo400, chakra400].map((href) => ({
    rel: 'preload',
    href,
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous' as const,
  })),
];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  const nonce = useContext(NonceContext);
  const theme = data?.theme;
  return (
    <html
      lang="en"
      data-theme={theme?.slug}
      data-motif={theme?.motif}
      data-fx={data?.fx ?? 'rich'}
      // SSR paints the equipped theme, so there is never a flash of the house colours.
      style={
        theme
          ? (styleObject(varsToStyle(theme.vars), theme.mood) as React.CSSProperties)
          : undefined
      }
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={theme?.vars['--bg'] ?? '#12101a'} />
        <Meta />
        <Links />
        {/* Without JavaScript the intro never hydrates: drop its curtain so the page is readable. */}
        <noscript>
          <style>{'.intro-curtain{display:none!important}'}</style>
        </noscript>
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

function styleObject(css: string, mood: string): Record<string, string> {
  const o: Record<string, string> = { colorScheme: mood };
  for (const pair of css.split(';')) {
    const i = pair.indexOf(':');
    if (i > 0) o[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return o;
}

type RootData = Route.ComponentProps['loaderData'];

/** After a page change, move focus to the new page (screen readers announce it; Tab starts there). */
function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs on purpose for each new pathname.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

/** Providers + site chrome around a page; error pages use it too, so nobody is stranded. */
function Shell({ data, children }: { data: RootData; children: ReactNode }) {
  const playing = /^\/arena\/[^/]+/.test(useLocation().pathname);
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <FxProvider initial={data.fx}>
          <ThemeProvider initial={data.theme} top5={data.top5}>
            <a href="#main" className="skip-link btn btn-c3">
              Skip to content
            </a>
            <LoaderStage playIntro={data.playIntro} />
            <RouteFocus />
            {!playing && <EasterEggs />}
            <Atmosphere hidden={playing} />
            <Header user={data.user} />
            <OfflineBanner />
            <main id="main" tabIndex={-1} className="relative z-[1] outline-none">
              {children}
            </main>
            {!playing && <Footer />}
            {/* Game screens own the whole viewport: no dock or tab bar over the touch controls. */}
            {!playing && <ThemeDock />}
            {!playing && <MobileTabs />}
          </ThemeProvider>
        </FxProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <Shell data={loaderData}>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const title = notFound ? 'Lost in the multiverse' : 'KRAK! Something broke';
  const detail = isRouteErrorResponse(error)
    ? error.data || error.statusText
    : import.meta.env.DEV && error instanceof Error
      ? error.message
      : 'Try again in a moment.';
  const data = useRouteLoaderData<typeof loader>('root');
  const body = (
    <div className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-16 text-center">
      <div className="panel halftone tilt-l w-full space-y-4 p-8">
        <p className="kicker">{notFound ? 'Error 404' : 'Error'}</p>
        <h1 className="h-display ink-text text-6xl text-c1-text">{title}</h1>
        <p>{String(detail)}</p>
        <Link to="/" className="btn btn-c1">
          Back to base
        </Link>
      </div>
    </div>
  );
  // A page 404 keeps the header, tab bar and footer; only a root-loader failure falls back to bare.
  if (data) return <Shell data={{ ...data, playIntro: false }}>{body}</Shell>;
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      {body}
    </main>
  );
}
