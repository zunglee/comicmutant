/**
 * Site skin picker: a popover on desktop, a bottom sheet on phones. Each trigger owns its dialog, so
 * the header button, the phone menu entry and the footer link all work and focus returns to
 * whichever one opened it. Renders in the current skin's tokens.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSkin } from '~/skins/context';
import { SKINS, skinFontImports } from '~/skins/registry';
import { SKIN_IDS, type SkinId } from '~/skins/types';
import { IconPalette, IconX } from './icons';
import { type Point, SkinPickerPanel } from './skin-picker/panel';
import { Button } from './ui';

const OPEN_EVENT = 'cm:open-skin-picker';

/** Opens the page's host picker; focus goes back to `returnTo` when it closes (e.g. the menu button). */
export function openSkinPicker(returnTo?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { returnTo } }));
}

/** A phone-menu entry: closes the menu (onOpen) and opens the host picker, which outlives the menu. */
export function SkinPickerMenuItem({
  returnTo,
  onOpen,
  className = '',
  plain,
}: {
  returnTo: () => HTMLElement | null;
  onOpen: () => void;
  className?: string;
  /** Plain button styling (calm skins' own nav-link class) instead of .btn. */
  plain?: boolean;
}) {
  const go = () => {
    const to = returnTo();
    onOpen();
    openSkinPicker(to);
  };
  return plain ? (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={go}
      className={`cursor-pointer ${className}`}
    >
      Look &amp; feel
    </button>
  ) : (
    <Button block aria-haspopup="dialog" onClick={go} className={`justify-start ${className}`}>
      <IconPalette />
      Look &amp; feel
    </Button>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function SkinPicker({
  variant = 'header',
  className = '',
  onOpenChange,
}: {
  /** header: icon button + label; menu: full-width button; link: plain text link (footers). */
  variant?: 'header' | 'menu' | 'link' | 'host';
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const { setSkin, source } = useSkin();
  const [saved, setSaved] = useState<string | null>(null);
  const [open, setOpenState] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dialogId = useId();

  const setOpen = useCallback(
    (v: boolean) => {
      if (v) setSaved(null);
      setOpenState(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const returnTo = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    const back = returnTo.current?.isConnected ? returnTo.current : trigger.current;
    returnTo.current = null;
    back?.focus();
  }, [setOpen]);

  // The host variant has no trigger of its own: menus and other entries open it by event.
  useEffect(() => {
    if (variant !== 'host') return;
    const on = (e: Event) => {
      returnTo.current =
        (e as CustomEvent<{ returnTo?: HTMLElement | null }>).detail?.returnTo ?? null;
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, [variant, setOpen]);

  // Load every skin's faces so each preview shows its own display font.
  useEffect(() => {
    if (!open) return;
    for (const id of SKIN_IDS) skinFontImports[id]().catch(() => undefined);
  }, [open]);

  // Focus in on open: the pressed card (the visitor's pick), else the first.
  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    const cards = el?.querySelectorAll<HTMLElement>('[data-skin-card]');
    const pressed = el?.querySelector<HTMLElement>('[data-skin-card][aria-pressed="true"]');
    (pressed ?? cards?.[0])?.focus();
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = dialog.current;
    if (!el) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // Keep the header's own Esc handler (phone menu) from also firing.
      e.nativeEvent.stopImmediatePropagation();
      close();
      return;
    }
    const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Tab' && items.length) {
      const next = e.shiftKey ? i - 1 : i + 1;
      if (next < 0 || next >= items.length) {
        e.preventDefault();
        items[(next + items.length) % items.length]?.focus();
      }
      return;
    }
    const cards = [...el.querySelectorAll<HTMLElement>('[data-skin-card]')];
    const ci = cards.indexOf(document.activeElement as HTMLElement);
    if (ci < 0) return;
    let to = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = (ci + 1) % cards.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
      to = (ci - 1 + cards.length) % cards.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = cards.length - 1;
    if (to >= 0) {
      e.preventDefault();
      cards[to]?.focus();
    }
  };

  // Esc also closes when focus is somewhere unexpected (the phone menu's handler sits on window).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dialog.current?.contains(document.activeElement)) return;
      e.stopImmediatePropagation();
      close();
    };
    document.addEventListener('keydown', onDoc, true);
    return () => document.removeEventListener('keydown', onDoc, true);
  }, [open, close]);

  const pick = (id: SkinId | null, from: Point) => {
    void setSkin(id, from);
    if (source === 'lock') {
      // The page keeps its look: say the pick was saved instead of closing on nothing.
      setSaved("Saved. You'll see it outside the Sacred section.");
      return;
    }
    close();
  };

  const label = 'Look & feel';
  const common = {
    ref: trigger,
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': open,
    'aria-controls': open ? dialogId : undefined,
    onClick: () => (open ? close() : setOpen(true)),
  };
  return (
    <>
      {variant === 'host' ? null : variant === 'link' ? (
        <>
          <button
            type="button"
            {...common}
            className={`inline-flex min-h-11 cursor-pointer items-center text-left underline-offset-4 hover:underline ${className}`}
          >
            {label}
          </button>
          {/* No JS: the same cookie post, as plain buttons. */}
          <noscript>
            <form method="post" action="/api/skin" className="col-span-2 flex flex-wrap gap-2">
              {[
                ['auto', 'Automatic'] as const,
                ...SKIN_IDS.map((k) => [k, SKINS[k].label] as const),
              ].map(([v, t]) => (
                <button key={v} type="submit" name="skin" value={v} className="btn btn-sm">
                  {t}
                </button>
              ))}
            </form>
          </noscript>
        </>
      ) : variant === 'menu' ? (
        <Button {...common} block className={`justify-start ${className}`}>
          <IconPalette />
          {label}
        </Button>
      ) : (
        <Button {...common} size="sm" className={`size-11 p-0 ${className}`}>
          <IconPalette className="size-4" />
          {/* Icon-only: the header nav has no room for a label. */}
          <span className="sr-only">{label}</span>
        </Button>
      )}
      {open &&
        createPortal(
          <div className="skin-picker-layer" data-skin-picker-open>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close look and feel"
              className="skin-picker-scrim"
              onClick={close}
            />
            <div
              ref={dialog}
              id={dialogId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="skin-picker-sheet"
              onKeyDown={onKeyDown}
            >
              <Button
                size="sm"
                className="skin-picker-close size-11 p-0"
                aria-label="Close"
                onClick={close}
              >
                <IconX />
              </Button>
              <SkinPickerPanel onPick={pick} headingId={titleId} saved={saved} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
