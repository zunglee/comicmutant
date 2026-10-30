/** Site chrome: header, top-5 theme dock, mobile tab bar, footer. */
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Form, Link, NavLink, useLocation } from 'react-router';
import { useFxSetting } from '~/lib/fx';
import { useTheme } from '~/lib/theme/context';
import {
  IconBolt,
  IconClock,
  IconGear,
  IconGrid,
  IconHome,
  IconMenu,
  IconPad,
  IconPalette,
  IconUser,
  IconVs,
  IconWhisper,
  IconX,
} from './icons';

export const NAV = [
  { to: '/roster', label: 'Roster', icon: IconGrid },
  { to: '/arena', label: 'Arena', icon: IconPad },
  { to: '/versus', label: 'Versus', icon: IconVs },
  { to: '/rumours', label: 'Rumour Mill', icon: IconWhisper },
  { to: '/originals', label: 'Originals', icon: IconBolt },
  { to: '/themes', label: 'Themes', icon: IconPalette },
  { to: '/timeline', label: 'Timeline', icon: IconClock },
  { to: '/gadgets', label: 'Gadget Lab', icon: IconGear },
] as const;

/** Character pages belong to the Roster section, so it stays lit there. */
function inSection(to: string, pathname: string) {
  return to === '/roster' && pathname.startsWith('/c/');
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span
      className={`h-display inline-flex items-baseline gap-1 text-3xl leading-none ${className}`}
    >
      <span className="ink-text text-c3-text">COMIC</span>
      <span className="panel-c1 -rotate-3 px-1.5 py-0.5 text-2xl shadow-ink-sm">MUTANT</span>
    </span>
  );
}

export interface ChromeUser {
  name: string;
  role: string;
}

export function Header({ user }: { user: ChromeUser | null }) {
  const [open, setOpen] = useState(false);
  const { fx, setFx } = useFxSetting();
  const loc = useLocation();
  const menuBtn = useRef<HTMLButtonElement>(null);
  // Esc closes the mobile menu and hands focus back to its button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      menuBtn.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <header className="sticky top-0 z-40 border-line border-b-[3px] bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link to="/" className="mr-2 shrink-0" aria-label="ComicMutant home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              // 8 sections: Originals and Themes join the bar only on wide screens (the dock and the
              // menu reach them below that), so the bar never overflows at 1024px.
              className={({ isActive }) =>
                `h-head whitespace-nowrap rounded-md px-2 py-2 text-[0.8rem] uppercase transition-colors hover:bg-card xl:px-2.5 xl:text-sm ${
                  n.to === '/originals' || n.to === '/themes' ? 'hidden 2xl:inline-block' : ''
                } ${
                  isActive || inSection(n.to, loc.pathname)
                    ? 'bg-c1 text-on-c1 shadow-ink-sm'
                    : 'text-fg'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm whitespace-nowrap"
            aria-pressed={fx === 'rich'}
            aria-label={fx === 'rich' ? 'Rich FX' : 'Lite FX'}
            onClick={() => setFx(fx === 'rich' ? 'lite' : 'rich')}
            title="Rich mode animates every clip; Lite shows stills until you tap"
          >
            <IconBolt className="size-4" />
            {/* Phones show "FX" only, so the button stays one line at 375px. */}
            <span>
              <span className="hidden sm:inline">{fx === 'rich' ? 'Rich ' : 'Lite '}</span>FX
            </span>
          </button>
          {user ? (
            <Form method="post" action="/logout" className="hidden sm:block">
              <button type="submit" className="btn btn-sm" aria-label={`Sign out ${user.name}`}>
                <IconUser className="size-4" />
                <span className="max-w-24 truncate">{user.name}</span>
              </button>
            </Form>
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(loc.pathname)}`}
              className="btn btn-sm btn-c3 hidden sm:inline-flex"
            >
              <IconUser className="size-4" />
              Sign in
            </Link>
          )}
          <button
            ref={menuBtn}
            type="button"
            className="btn btn-sm lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <m.nav
            id="mobile-menu"
            aria-label="Main"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2 }}
            className="border-line border-t-[3px] lg:hidden"
          >
            <ul className="grid grid-cols-2 gap-2 p-4">
              {NAV.map((n, i) => (
                <m.li
                  key={n.to}
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <NavLink
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `btn w-full justify-start ${isActive || inSection(n.to, loc.pathname) ? 'btn-c1' : ''}`
                    }
                  >
                    <n.icon />
                    {n.label}
                  </NavLink>
                </m.li>
              ))}
              <li className="col-span-2">
                {user ? (
                  <Form method="post" action="/logout">
                    <button type="submit" className="btn w-full">
                      Sign out {user.name}
                    </button>
                  </Form>
                ) : (
                  <Link to="/login" onClick={() => setOpen(false)} className="btn btn-c3 w-full">
                    Sign in / Join
                  </Link>
                )}
              </li>
            </ul>
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Floating top-5 dock: one tap re-skins the whole site, with a halftone wipe from the swatch. */
export function ThemeDock() {
  const { top5, current, equip } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  // Below lg the dock folds to one swatch button so it never sits over content; tap to open.
  const [open, setOpen] = useState(false);
  return (
    <aside
      aria-label="Quick themes"
      className="fixed right-3 bottom-[4.75rem] z-30 lg:right-5 lg:bottom-5"
    >
      <div className="panel flex items-center gap-2 p-1.5">
        <button
          type="button"
          className="relative size-11 cursor-pointer rounded-full border-[3px] border-line lg:hidden"
          aria-expanded={open}
          aria-controls="dock-swatches"
          aria-label={open ? 'Close quick themes' : 'Open quick themes'}
          onClick={() => setOpen((v) => !v)}
          style={{
            background: `conic-gradient(${current.vars['--c1']} 0 50%, ${current.vars['--c2']} 0 80%, ${current.vars['--c3']} 0)`,
          }}
        >
          {open && (
            <IconX className="absolute inset-0 m-auto size-5 rounded-full bg-card text-card-fg" />
          )}
        </button>
        <div
          id="dock-swatches"
          className={`${open ? 'flex' : 'hidden'} items-center gap-2 lg:flex`}
        >
          <span className="kicker hidden px-1 lg:inline">Top 5</span>
          {top5.map((p) => {
            const active = p.slug === current.slug;
            return (
              <button
                key={p.slug}
                type="button"
                aria-pressed={active}
                aria-label={`Switch to ${p.name} theme`}
                title={p.name}
                disabled={busy !== null}
                onClick={async (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setBusy(p.slug);
                  try {
                    await equip(p, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                  } finally {
                    setBusy(null);
                  }
                }}
                className={`relative size-11 cursor-pointer overflow-hidden rounded-full border-[3px] border-line transition-transform hover:-translate-y-0.5 ${
                  active ? 'scale-110 ring-[3px] ring-c3' : ''
                }`}
                style={{
                  background: `conic-gradient(${p.vars['--c1']} 0 50%, ${p.vars['--c2']} 0 80%, ${p.vars['--c3']} 0)`,
                }}
              >
                {active && (
                  <span className="absolute inset-0 m-auto size-2.5 rounded-full border-2 border-line bg-white" />
                )}
              </button>
            );
          })}
          <Link
            to="/themes"
            className="btn btn-sm ml-0.5 size-11 p-0"
            aria-label="Browse all themes"
            title="All themes"
          >
            <IconPalette />
          </Link>
        </div>
      </div>
    </aside>
  );
}

const TABS = [{ to: '/', label: 'Home', icon: IconHome }, ...NAV.slice(0, 3), NAV[5]] as const;

export function MobileTabs() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Quick"
      className="fixed inset-x-0 bottom-0 z-40 border-line border-t-[3px] bg-bg/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 font-head text-xs uppercase ${
                  isActive || inSection(t.to, pathname) ? 'text-c3-text' : 'text-fg'
                }`
              }
            >
              <t.icon />
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="relative z-[1] mt-24 border-line border-t-[3px] bg-card pb-28 text-card-fg lg:pb-10">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md text-sm text-muted">
            An unofficial, non-commercial fan site. Not affiliated with or endorsed by Marvel, DC,
            Raj Comics, Diamond Comics, any studio or any rights holder. Character names belong to
            their owners; facts are summarised in our own words. Every drawing and animation here is
            original. Games use ComicMutant originals only.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-2 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="inline-flex min-h-11 items-center underline-offset-4 hover:text-c1-text hover:underline"
            >
              {n.label}
            </Link>
          ))}
          <Link
            to="/about"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:text-c1-text hover:underline"
          >
            About &amp; credits
          </Link>
        </nav>
        <p className="text-sm text-muted">
          Photos: Wikimedia Commons, credited on each page. No ads, no merch, no tracking.
        </p>
      </div>
    </footer>
  );
}

/**
 * Offline notice: in-app links need the network (route data and code), so say so up front instead
 * of letting a tap end on the browser's own error page.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    // While offline, an in-app link would fail and drop the visitor on the browser's error page:
    // hold the tap here (the notice explains why) instead.
    const hold = (e: MouseEvent) => {
      if (navigator.onLine) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="/"]');
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      setOffline(true);
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    document.addEventListener('click', hold, true);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      document.removeEventListener('click', hold, true);
    };
  }, []);
  return (
    <div aria-live="polite" className="fixed inset-x-0 top-16 z-[45] flex justify-center px-4">
      {offline && (
        <p className="bubble font-semibold text-sm">
          You're offline. This page still works; other pages will load when you reconnect.
        </p>
      )}
    </div>
  );
}
