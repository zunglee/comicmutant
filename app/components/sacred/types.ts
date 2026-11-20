/** Serializable shapes shared by the Sacred India loaders and components (no server imports). */
import type { SacredGroup, SacredSymbol, Tradition } from '~/lib/sacred-taxonomy';
import { GROUP_TABLE, TRADITION_TABLE } from '~/lib/sacred-taxonomy';

export interface CardFact {
  text: string;
}

/** A light row for "show all" lists: enough to link to a profile, nothing more. */
export interface CardRow {
  slug: string;
  name: string;
  native?: string;
  ready: boolean;
}

export const toRow = (c: SacredCardData): CardRow => ({
  slug: c.slug,
  name: c.name,
  ...(c.native ? { native: c.native } : {}),
  ready: c.ready,
});

/** What a card needs. `ready: false` = on the roster, profile still being written. */
export interface SacredCardData {
  slug: string;
  name: string;
  native?: string;
  tradition: Tradition;
  group: SacredGroup;
  role: string;
  symbol: SacredSymbol;
  palette: { c1: string; c2: string };
  ready: boolean;
  /** Top three facts by interest (back of the card). Empty when not ready. */
  facts: CardFact[];
}

/**
 * Calm default colours per tradition, used until a profile brings its own. They are mixes of the
 * sacred skin's tokens (CSS values, applied as --sc-a / --sc-b), so a retuned skin retunes the doors.
 * --sacred-gold is the decorative gold app.css defines on the realm.
 */
export const TRADITION_LOOK: Record<
  Tradition,
  { c1: string; c2: string; symbol: SacredSymbol; line: string }
> = {
  hindu: { c1: 'var(--c1)', c2: 'var(--c2)', symbol: 'lotus', line: 'Lotus and flame' },
  buddhist: {
    c1: 'var(--sacred-gold)',
    c2: 'var(--c3)',
    symbol: 'tree',
    line: 'Wheel, tree and path',
  },
  jain: {
    c1: 'var(--c3)',
    c2: 'color-mix(in srgb, var(--fg) 55%, var(--card))',
    symbol: 'feather',
    line: 'Gentleness to every life',
  },
  sikh: { c1: 'var(--fg)', c2: 'var(--c1)', symbol: 'lamp', line: 'One light, ten Gurus' },
};

export const groupLabel = (id: string) => GROUP_TABLE.find((g) => g.id === id)?.label ?? id;
export const traditionLabel = (id: string) => TRADITION_TABLE.find((t) => t.id === id)?.label ?? id;
