import '@fontsource/bangers/latin-400';
import '@fontsource/russo-one/latin-400';
import '@fontsource/chakra-petch/latin-400';
import '@fontsource/chakra-petch/latin-600';
// Sacred India realm faces (calm serif display + soft body); fetched only where the page uses them.
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
// Devanagari-capable families use the per-weight files: their @font-face rules carry unicode-range,
// so the Hindi subset downloads only on pages that show Devanagari (S21).
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/600.css';
import '@fontsource/tiro-devanagari-hindi/400.css';
// Crime city and Desi heroes skin faces: @font-face only, fetched when a page uses them.
import '@fontsource/oswald/latin-700.css';
import '@fontsource/yatra-one/400.css';
import '@fontsource/teko/latin-600.css';
// unicode-range: the Gurmukhi file is fetched only on pages that show Gurmukhi (Sikh profiles).
import '@fontsource/noto-sans-gurmukhi/400.css';
import './app.css';

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
import { SkinAtmosphere } from '~/components/atmosphere/index';
import { Footer, Header, MobileTabs, OfflineBanner, ThemeDock } from '~/components/chrome';
import { EasterEggs } from '~/components/eggs';
import { LoaderStage } from '~/components/loaders';
import { FX_COOKIE, type Fx, FxProvider } from '~/lib/fx';
import { NonceContext } from '~/lib/nonce';
import { ThemeProvider } from '~/lib/theme/context';
import { htmlMood, htmlVars } from '~/skins/compute';
import { realmOf, SkinProvider, useSkin } from '~/skins/context';
import { preloadHrefs, SKINS } from '~/skins/registry';
import { pickSkin } from '~/skins/select';
import type { Route } from './+types/root';

/** Animation features arrive in their own chunk; `m.*` components render static until then. */
const loadMotionFeatures = () => import('~/lib/motion-features').then((r) => r.default);

export async function loader({ request }: Route.LoaderArgs) {
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const { current, top5 } = readThemeState(request);
  const fx: Fx = readCookie(request, FX_COOKIE) === 'lite' ? 'lite' : 'rich';
  // First page of a session plays the intro (never for bots or Lite FX, and never over a timed game
  // screen, where it would cover the first question while its clock runs).
  const path = new URL(request.url).pathname;
  // The skin is picked here, before first paint (lock > pinned > section default > comic).
  const skin = pickSkin(request, path);
  const gameScreen = path === '/quiz/play' || path === '/freefall' || path.startsWith('/arena/');
  const playIntro =
    fx === 'rich' &&
    !gameScreen &&
    // A calm skin (the Sacred realm) never opens with a comic slam.
    !SKINS[skin.id].motion.calm &&
    !readCookie(request, 'cm_seen') &&
    !isbot(request.headers.get('user-agent') ?? '');
  return {
    theme: current,
    top5,
    skin: { id: skin.id, pinned: skin.pinned, source: skin.source },
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
];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  const nonce = useContext(NonceContext);
  const theme = data?.theme;
  // Everything on <html> comes from the root loader (picked from the request URL), never from the
  // live location: after hydration SkinProvider and applyPack own these attributes, and a stable
  // prop means React never writes a stale value back over them.
  const skin = SKINS[data?.skin.id ?? 'comic'];
  // Skin vars first, then the equipped character's vars as the skin's surface policy allows (T3).
  const vars = htmlVars(skin, theme?.vars, theme?.slug);
  return (
    <html
      lang="en"
      data-skin={skin.id}
      // One-release alias, on the Sacred routes only (S19): not written when sacred is merely pinned.
      data-realm={realmOf(skin.id, data?.skin.source)}
      data-theme={theme?.slug}
      data-motif={theme?.motif}
      data-fx={data?.fx ?? 'rich'}
      // SSR paints skin + theme, so there is never a flash of the house colours.
      style={styleObject(vars, htmlMood(skin, theme?.mood)) as React.CSSProperties}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={vars['--bg']} />
        {/* Only the active skin's above-the-fold faces (comic: Russo One sets kickers and buttons; a
            late swap re-centred character heroes, CLS 0.26). Other skins' faces load on demand. */}
        {preloadHrefs(skin).map((href) => (
          <link
            key={href}
            rel="preload"
            href={href}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
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

function styleObject(vars: Record<string, string>, mood: string): Record<string, string> {
  return { colorScheme: mood, ...vars };
}

type RootData = Route.ComponentProps['loaderData'];

/** After a page change, move focus to the new page (screen readers announce it; Tab starts there). */
function RouteFocus() {
  const { pathname } = useLocation();
  // Compare with the path we last saw: a hard load (and React StrictMode's second effect run in dev)
  // sees no change, so focus is left on the skip link; only real client navigations move it.
  const seen = useRef(pathname);
  useEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

/** Providers + site chrome around a page; error pages use it too, so nobody is stranded. */
function Shell({ data, children }: { data: RootData; children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <FxProvider initial={data.fx}>
          <ThemeProvider initial={data.theme} top5={data.top5}>
            <SkinProvider initial={data.skin}>
              <ShellChrome data={data}>{children}</ShellChrome>
            </SkinProvider>
          </ThemeProvider>
        </FxProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

/** The chrome inside the providers: what mounts depends on the active skin, not the URL (S19). */
function ShellChrome({ data, children }: { data: RootData; children: ReactNode }) {
  const { pathname } = useLocation();
  const playing = /^\/arena\/[^/]+/.test(pathname);
  // A calm skin (Sacred, on its routes or pinned anywhere) has no comic intro, page sweeps, easter
  // eggs or theme dock: nothing loud and nothing under 0.4 s (T7).
  const calm = useSkin().spec.motion.calm;
  return (
    <>
      <a href="#main" className="skip-link btn btn-c3">
        Skip to content
      </a>
      {!calm && <LoaderStage playIntro={data.playIntro} />}
      <RouteFocus />
      {!playing && !calm && <EasterEggs />}
      <SkinAtmosphere hidden={playing} />
      <Header user={data.user} />
      <OfflineBanner />
      <main id="main" tabIndex={-1} className="relative z-[1] outline-none">
        {children}
      </main>
      {!playing && <Footer />}
      {/* Game screens own the whole viewport: no dock or tab bar over the touch controls. */}
      {!playing && !calm && <ThemeDock />}
      {!playing && <MobileTabs />}
    </>
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
