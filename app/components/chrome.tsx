/** Site chrome: header, top-5 theme dock, mobile tab bar, footer. */
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Form, Link, NavLink, useLocation } from 'react-router';
import { isSacredPath } from '~/components/sacred/realm';
import { MOTIFS } from '~/components/sacred/symbol-art';
import { TRADITION_LOOK } from '~/components/sacred/types';
import { useFxSetting } from '~/lib/fx';
import { TRADITION_TABLE } from '~/lib/sacred-taxonomy';
import { useTheme } from '~/lib/theme/context';
import { useSkinMotion } from '~/skins/motion';
import {
  IconBolt,
  IconClock,
  IconGear,
  IconGrid,
  IconHome,
  IconMenu,
  IconPad,
  IconPalette,
  IconQuiz,
  IconUser,
  IconVs,
  IconWhisper,
  IconX,
} from './icons';
import { SkinPicker, SkinPickerMenuItem } from './skin-picker';
import { Button, ButtonLink, buttonClass } from './ui';

/** Small static lotus for the nav (the animated art lives in components/sacred). */
function IconLotus({ className = 'size-5' }: { className?: string }) {
  return <MiniSymbol symbol="lotus" className={className} />;
}

function MiniSymbol({
  symbol,
  className = 'size-5',
}: {
  symbol: keyof typeof MOTIFS;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {MOTIFS[symbol].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const NAV = [
  { to: '/roster', label: 'Roster', icon: IconGrid },
  { to: '/arena', label: 'Arena', icon: IconPad },
  { to: '/quiz', label: 'Quiz', icon: IconQuiz },
  { to: '/versus', label: 'Versus', icon: IconVs },
  { to: '/rumours', label: 'Rumour Mill', icon: IconWhisper },
  { to: '/originals', label: 'Originals', icon: IconBolt },
  { to: '/themes', label: 'Themes', icon: IconPalette },
  { to: '/timeline', label: 'Timeline', icon: IconClock },
  { to: '/gadgets', label: 'Gadget Lab', icon: IconGear },
  // Appended last: the phone tab bar picks NAV[0..2] and NAV[6] by index.
  { to: '/sacred', label: 'Sacred', icon: IconLotus },
  { to: '/desi', label: 'Desi', icon: IconBolt },
] as const;

/** Character pages belong to the Roster section, so it stays lit there. */
function inSection(to: string, pathname: string) {
  return to === '/roster' && pathname.startsWith('/c/');
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`h-display logo inline-flex items-baseline gap-1 leading-none ${className}`}>
      <span className="ink-text text-c3-text">COMIC</span>
      <span className="panel-c1 tilt-skin-3 px-1.5 py-0.5 text-[0.8em] leading-[1.333] shadow-ink-sm">
        MUTANT
      </span>
    </span>
  );
}

export interface ChromeUser {
  name: string;
  role: string;
}

/** The whole template changes under /sacred: calm header, tab bar and footer. */
export function Header({ user }: { user: ChromeUser | null }) {
  return isSacredPath(useLocation().pathname) ? <SacredHeader /> : <ComicHeader user={user} />;
}

function ComicHeader({ user }: { user: ChromeUser | null }) {
  const mo = useSkinMotion();
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
    <header className="hide-in-game-touch sticky top-0 z-40 border-line border-b-skin bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link to="/" className="mr-2 min-w-0 shrink" aria-label="ComicMutant home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              title={n.to === '/desi' ? 'देसी सुपरहीरो · Indian superheroes' : undefined}
              // 8 sections: Originals and Themes join the bar only on wide screens (the dock and the
              // menu reach them below that), so the bar never overflows at 1024px.
              className={({ isActive }) =>
                `h-head whitespace-nowrap rounded-skin-s px-2 py-2 text-[0.8rem] uppercase transition-colors hover:bg-card xl:px-2.5 xl:text-sm ${
                  n.to === '/originals' || n.to === '/themes' || n.to === '/desi'
                    ? 'hidden 2xl:inline-block'
                    : n.to === '/sacred'
                      ? 'hidden'
                      : ''
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
          <ButtonLink
            to="/sacred"
            size="sm"
            className="hidden whitespace-nowrap lg:inline-flex"
            title="Sacred India: a calm space for India's faiths and their figures"
          >
            <IconLotus className="size-4" />
            Sacred
          </ButtonLink>
          <SkinPicker variant="header" className="hidden xl:inline-flex 2xl:hidden" />
          <Button
            size="sm"
            className="whitespace-nowrap"
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
          </Button>
          {user ? (
            <Form method="post" action="/logout" className="hidden sm:block">
              <Button type="submit" size="sm" aria-label={`Sign out ${user.name}`}>
                <IconUser className="size-4" />
                <span className="max-w-24 truncate">{user.name}</span>
              </Button>
            </Form>
          ) : (
            <ButtonLink
              to={`/login?next=${encodeURIComponent(loc.pathname)}`}
              variant="c3"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <IconUser className="size-4" />
              Sign in
            </ButtonLink>
          )}
          <Button
            ref={menuBtn}
            size="sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconX /> : <IconMenu />}
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <m.nav
            id="mobile-menu"
            aria-label="Main"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0, transition: mo.tween(0.12) }}
            transition={mo.tween(0.2)}
            className="border-line border-t-skin lg:hidden"
          >
            <ul className="grid grid-cols-2 gap-2 p-4">
              {NAV.map((n, i) => (
                <m.li
                  key={n.to}
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  // Motion's default spring on loud skins (unchanged); a calm tween otherwise.
                  transition={
                    mo.calm
                      ? mo.tween(0.2, { delay: mo.delay(i, 0.03) })
                      : { delay: mo.delay(i, 0.03) }
                  }
                >
                  <NavLink
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      buttonClass({
                        variant: isActive || inSection(n.to, loc.pathname) ? 'c1' : 'plain',
                        block: true,
                        className: 'justify-start',
                      })
                    }
                  >
                    <n.icon />
                    {n.label}
                  </NavLink>
                </m.li>
              ))}
              <li className="col-span-2">
                <SkinPickerMenuItem
                  returnTo={() => menuBtn.current}
                  onOpen={() => setOpen(false)}
                />
              </li>
              <li className="col-span-2">
                {user ? (
                  <Form method="post" action="/logout">
                    <Button type="submit" block>
                      Sign out {user.name}
                    </Button>
                  </Form>
                ) : (
                  <ButtonLink to="/login" onClick={() => setOpen(false)} variant="c3" block>
                    Sign in / Join
                  </ButtonLink>
                )}
              </li>
            </ul>
          </m.nav>
        )}
      </AnimatePresence>
      <SkinPicker variant="host" />
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
      className="site-dock hide-in-game fixed right-3 bottom-[4.75rem] z-30 lg:right-5 lg:bottom-5"
    >
      <div className="panel flex items-center gap-2 p-1.5">
        <button
          type="button"
          className="relative size-11 cursor-pointer rounded-skin-pill border-skin border-line lg:hidden"
          aria-expanded={open}
          aria-controls="dock-swatches"
          aria-label={open ? 'Close quick themes' : 'Open quick themes'}
          onClick={() => setOpen((v) => !v)}
          style={{
            background: `conic-gradient(${current.vars['--c1']} 0 50%, ${current.vars['--c2']} 0 80%, ${current.vars['--c3']} 0)`,
          }}
        >
          {open && <IconX className="absolute inset-0 m-auto size-5 round bg-card text-card-fg" />}
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
                className={`relative size-11 cursor-pointer overflow-hidden rounded-skin-pill border-skin border-line transition-transform hover:-translate-y-0.5 ${
                  active ? 'scale-110 ring-[3px] ring-c3' : ''
                }`}
                style={{
                  background: `conic-gradient(${p.vars['--c1']} 0 50%, ${p.vars['--c2']} 0 80%, ${p.vars['--c3']} 0)`,
                }}
              >
                {active && (
                  <span className="absolute inset-0 m-auto size-2.5 rounded-skin-pill border-skin-s border-line bg-white" />
                )}
              </button>
            );
          })}
          <ButtonLink
            to="/themes"
            size="sm"
            className="ml-0.5 size-11 p-0"
            aria-label="Browse all themes"
            title="All themes"
          >
            <IconPalette />
          </ButtonLink>
        </div>
      </div>
    </aside>
  );
}

// Phone tab bar: Home, Roster, Arena, Quiz, Themes (the rest live in the menu).
const TABS = [{ to: '/', label: 'Home', icon: IconHome }, ...NAV.slice(0, 3), NAV[6]] as const;

// Phone tab bar (5 max): the four traditions and Learn. The hub is the wordmark in the header, and
// each tradition page links back to it.
const SACRED_TABS = [
  ...TRADITION_TABLE.map((t) => ({
    to: `/sacred/${t.id}`,
    label: t.label,
    symbol: TRADITION_LOOK[t.id].symbol,
  })),
  { to: '/sacred/learn', label: 'Learn', symbol: 'book' },
] as const;

export function MobileTabs() {
  const { pathname } = useLocation();
  if (isSacredPath(pathname)) {
    return (
      <nav
        aria-label="Quick"
        className="hide-in-game sacred-tabs fixed inset-x-0 bottom-0 z-40 lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {SACRED_TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} end={t.to === '/sacred'} className="sacred-tab">
                <MiniSymbol symbol={t.symbol} className="size-5" />
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav
      aria-label="Quick"
      className="hide-in-game fixed inset-x-0 bottom-0 z-40 border-line border-t-skin bg-bg/95 backdrop-blur lg:hidden"
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
  if (isSacredPath(useLocation().pathname)) return <SacredFooter />;
  return (
    <footer className="relative z-[1] mt-24 border-line border-t-skin bg-card pb-28 text-card-fg lg:pb-10">
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
          <SkinPicker variant="link" className="hover:text-c1-text" />
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

// ── Sacred India realm chrome ─────────────────────────────────────────────────────────

function LotusMark({ className = 'size-7 sm:size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <g
        fill="none"
        stroke="var(--c1)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {MOTIFS.lotus.slice(0, 5).map((d, i) => (
          <path key={d} d={d} stroke={i > 2 ? 'var(--c2)' : 'var(--c1)'} />
        ))}
      </g>
    </svg>
  );
}

export function SacredWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`sacred-wordmark inline-flex items-center gap-2 ${className}`}>
      <LotusMark />
      <span>Sacred India</span>
    </span>
  );
}

const SACRED_LINKS = [
  ...TRADITION_TABLE.map((t) => ({ to: `/sacred/${t.id}`, label: t.label })),
  { to: '/sacred/learn', label: 'Learn' },
];

function SacredHeader() {
  const mo = useSkinMotion();
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
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
    <header className="hide-in-game-touch sacred-header sticky top-0 z-40">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link
          to="/sacred"
          className="mr-2 inline-flex min-h-11 shrink-0 items-center"
          aria-label="Sacred India home"
        >
          <SacredWordmark />
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {SACRED_LINKS.map((n) => (
            <NavLink key={n.to} to={n.to} className="sacred-navlink">
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/" className="sacred-leave" title="Return to the ComicMutant comic site">
            <span className="sm:hidden">Comic site</span>
            <span className="hidden sm:inline">Back to ComicMutant</span>
          </Link>
          <SkinPicker variant="header" className="hidden xl:inline-flex" />
          <span className="lg:hidden">
            <button
              ref={menuBtn}
              type="button"
              className="sacred-iconbtn"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <IconX /> : <IconMenu />}
            </button>
          </span>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <m.nav
            id="mobile-menu"
            aria-label="Main"
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0, transition: mo.tween(0.3) }}
            transition={mo.tween(0.7, { ease: mo.ease })}
            className="sacred-menu lg:hidden"
          >
            <ul className="grid grid-cols-2 gap-2 p-4">
              {[{ to: '/sacred', label: 'Sacred home' }, ...SACRED_LINKS].map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.to === '/sacred'}
                    onClick={() => setOpen(false)}
                    className="sacred-navlink w-full"
                  >
                    {n.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <SkinPickerMenuItem
                  returnTo={() => menuBtn.current}
                  onOpen={() => setOpen(false)}
                  className="sacred-navlink w-full"
                  plain
                />
              </li>
            </ul>
          </m.nav>
        )}
      </AnimatePresence>
      <SkinPicker variant="host" />
    </header>
  );
}

function SacredFooter() {
  return (
    <footer className="sacred-footer relative z-[1] mt-24 pb-28 lg:pb-10">
      <svg viewBox="0 0 400 40" className="sacred-divider mx-auto" aria-hidden focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M10 20 H170 M230 20 H390" />
          <path d="M200 6 C208 14 208 26 200 34 C192 26 192 14 200 6Z" />
          <path d="M200 34 C190 32 182 24 180 16 C190 18 198 24 200 34Z" />
          <path d="M200 34 C210 32 218 24 220 16 C210 18 202 24 200 34Z" />
        </g>
      </svg>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <SacredWordmark />
          <p className="max-w-md text-sm">
            Sacred India shares what each tradition says, in our own words, with sources. Where
            tellings differ we name them and never rank them. There are no pictures of deities,
            Gurus or saints here: the cards use plain, original patterns. An unofficial,
            non-commercial project.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-2 text-sm">
          {SACRED_LINKS.map((n) => (
            <Link key={n.to} to={n.to} className="sacred-footlink">
              {n.label}
            </Link>
          ))}
          <Link to="/about" className="sacred-footlink">
            About &amp; credits
          </Link>
          <Link to="/" className="sacred-footlink">
            ComicMutant home
          </Link>
          <SkinPicker variant="link" className="sacred-footlink" />
        </nav>
        <p className="text-sm">
          Found a mistake, or a telling we missed? Facts link to their sources on each profile; we
          fix errors gladly. No ads, no merch, no tracking.
        </p>
      </div>
    </footer>
  );
}
