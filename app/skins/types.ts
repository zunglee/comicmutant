/**
 * Skin contract (reports/skins-design.md). A skin is the site-level look and feel: colours, type,
 * shape, motion, atmosphere and icon style. Changing the theme of the whole site means editing ONE
 * skin file (app/skins/<id>.ts); every component reads these tokens through CSS variables
 * (skinVars) or the useSkin() hook, never raw hex or font names.
 *
 * Zod-free so the browser can import it. Colour contrast is enforced by skinVars() (compute.ts) and
 * a unit test over every registered skin.
 */

import type { SKINS } from './registry';

/**
 * Skin ids come from the registry (app/skins/registry.ts): adding a skin is its spec file plus ONE
 * line in SKINS; nothing here changes.
 */
export type SkinId = keyof typeof SKINS;
export { SKIN_IDS } from './registry';

/** How a character's own palette (ThemeSpec) meets the skin. */
export type SurfacePolicy =
  /** Character colours drive the page surfaces too (today's comic behaviour; keeps the 100 themes). */
  | 'character'
  /** Skin owns bg/fg/card/line; the character's colours only tint accents (c1..c3 and their text/on colours). */
  | 'skin';

export interface SkinColors {
  bg: string;
  fg: string;
  card: string;
  cardFg: string;
  /** Second surface (inset panels, table stripes). */
  surface2: string;
  muted: string;
  /** Outlines and hairlines. */
  line: string;
  /**
   * Control borders (fields, buttons, chips) that must read at 3:1 on bg and card (WCAG 1.4.11).
   * Default = line; skinVars pushes whichever is used to 3:1, so a decorative `line` stays decorative.
   */
  lineStrong?: string;
  /** Default accents when no character theme is equipped. */
  c1: string;
  c2: string;
  c3: string;
  mood: 'dark' | 'light';
  /** Page background layers (CSS <image> list, may reference var(--*)). Empty string = flat. */
  backdrop: string;
  /** background-size for the backdrop layers (CSS), e.g. 'auto' or '14px 14px'. Default 'auto'. */
  backdropSize?: string;
  /** Exact text colours when a hand-picked pair is wanted; still AA-checked, never silently changed. */
  c1Text?: string;
  c3Text?: string;
}

export interface SkinType {
  /** CSS font-family stacks, fallbacks included. */
  display: string;
  head: string;
  body: string;
  /** Fontsource package ids to load (lazy per skin): e.g. 'bangers', 'cormorant-garamond'. */
  fonts: readonly { pkg: string; weights: readonly number[]; subset?: string }[];
  /**
   * The skin's self-hosted woff2 files it may preload, key → URL (`import x from '…woff2?url'` in the
   * spec file). Keys are fontsource file names, e.g. 'mukta-latin-400-normal'.
   */
  fontFiles: Readonly<Record<string, string>>;
  /** Keys of `fontFiles` to <link rel=preload> while this skin is active (above-the-fold faces). */
  preload: readonly string[];
  /**
   * Loads the skin's @font-face CSS on demand (a live switch awaits it before painting). Use the
   * fontsource per-weight files (`@fontsource/<pkg>/400.css`): they carry unicode-range, so a
   * Devanagari or Gurmukhi subset only downloads when that script is on the page.
   */
  fontLoaders: () => Promise<unknown>;
  displayCase: 'none' | 'uppercase';
  headCase: 'none' | 'uppercase';
  displayTracking: string; // CSS length
  headTracking: string;
  displayLeading: number;
  displayWeight: number;
  /** Heading (.h-head) line height. Default 1.1. */
  headLeading?: number;
  /** Font stack for buttons, chips and kickers (comic: the head face; sacred: the body face). */
  ui: string;
  uiWeight: number;
  /** letter-spacing for button and chip labels (CSS length). */
  uiTracking: string;
  /** letter-spacing for kickers (CSS length). */
  kickerTracking: string;
  /** Base body size multiplier on <html>. */
  scale: number;
}

export interface SkinShape {
  radiusS: string;
  radiusM: string;
  radiusL: string;
  /** Pill buttons/chips use radiusPill; comic uses a small radius. */
  radiusPill: string;
  borderW: string;
  /** Hard offset shadow (comic/crime) or soft blur (sacred): all four are CSS lengths/colour mixes. */
  shadowX: string;
  shadowY: string;
  shadowBlur: string;
  /** Shadow spread (CSS length), default '0'. Soft calm shadows use a negative spread. */
  shadowSpread?: string;
  shadowColor: string;
  /** Panel tilt in degrees (0 for calm skins). */
  tilt: string;
  /** Texture drawn on .halftone and the body: 'dots' | 'mandala' | 'scanlines' | 'none'. */
  pattern: 'dots' | 'mandala' | 'scanlines' | 'none';
  /** Button label transform. */
  buttonCase: 'none' | 'uppercase';
}

export interface SkinMotion {
  /** CSS easings (cubic-bezier strings). */
  easeOut: string;
  easeSnap: string;
  /** CSS durations, seconds as strings ('0.12s'). Calm skins keep fast >= 0.4s. */
  durFast: string;
  durBase: string;
  durSlow: string;
  /** Hover lift and press depth in px. */
  hoverLift: number;
  pressDepth: number;
  /** Motion (JS) spring + stagger used by shared entrance presets. */
  spring: { stiffness: number; damping: number };
  stagger: number;
  /** Entrance style for cards/panels. */
  entrance: 'pop' | 'rise' | 'fade' | 'slide';
  /** Page-transition / theme-wipe flavour. */
  wipe: 'halftone' | 'dusk' | 'glitch' | 'saffron';
  /** No shakes/flashes/bursts. Enforced by a test on calm skins. */
  calm: boolean;
}

export interface SkinAtmosphere {
  /** Background animation component to mount (app/components/atmosphere.tsx registry). */
  kind: 'comic-fx' | 'petals-diyas' | 'neon-rain' | 'marigold-dust';
  /** 0–1 strength over the reading column. */
  strength: number;
}

export interface SkinIcons {
  /** SVG stroke width for the shared icon set. */
  stroke: number;
  linecap: 'round' | 'square' | 'butt';
}

export interface SkinSpec {
  id: SkinId;
  /** Shown in the picker. */
  label: string;
  /** One line for the picker card. */
  blurb: string;
  /** The default for these route prefixes (first match wins); a pinned user choice overrides, except `lock`. */
  routes: readonly string[];
  /**
   * The skin stays whatever the user picked elsewhere (Sacred must stay calm, S8). A lock skin also
   * ignores the equipped character theme entirely, whatever `surfaces` says (compute.ts packLayerFor):
   * no character accents, no character mood.
   */
  lock: boolean;
  surfaces: SurfacePolicy;
  colors: SkinColors;
  type: SkinType;
  shape: SkinShape;
  motion: SkinMotion;
  atmosphere: SkinAtmosphere;
  icons: SkinIcons;
}

/**
 * CSS variables a skin writes on <html> (skinVars) and every component may read. Character themes keep
 * writing --c1..--c3 and friends (themeVars) on top. Names are the contract; add, never rename.
 */
export const SKIN_VAR_NAMES = [
  // colour
  '--bg',
  '--fg',
  '--card',
  '--card-fg',
  '--surface-2',
  '--muted',
  '--line',
  '--line-strong',
  // Border colour for .btn/.chip/.field: comic = --line (ink, pixel-identical); others = --line-strong.
  '--control-line',
  '--c1',
  '--c2',
  '--c3',
  '--on-c1',
  '--on-c2',
  '--on-c3',
  '--btn-c1',
  '--c1-text',
  '--c1-text-card',
  '--c3-text',
  '--glow',
  '--halftone',
  '--backdrop',
  // type
  '--font-display',
  '--font-head',
  '--font-body',
  '--display-case',
  '--head-case',
  '--display-tracking',
  '--head-tracking',
  '--display-leading',
  '--display-weight',
  '--type-scale',
  '--font-ui',
  '--ui-weight',
  '--ui-tracking',
  '--kicker-tracking',
  '--head-leading',
  // shape
  '--radius-s',
  '--radius-m',
  '--radius-l',
  '--radius-pill',
  '--border-w',
  '--shadow-x',
  '--shadow-y',
  '--shadow-blur',
  '--shadow-spread',
  '--backdrop-size',
  '--shadow-color',
  '--tilt',
  '--pattern-image',
  '--button-case',
  // Tile size for --pattern-image ('14px 14px', or 'auto' for full-bleed patterns). Added by T-core.
  '--pattern-size',
  // Dots inside .halftone panels (differ from the body pattern) and the .ink-text drop offset. T-core.
  '--halftone-image',
  '--halftone-size',
  '--ink-offset',
  // motion
  '--ease-out',
  '--ease-snap',
  '--dur-fast',
  '--dur-base',
  '--dur-slow',
  '--hover-lift',
  '--press-depth',
  // icons
  '--icon-stroke',
  '--icon-linecap',
] as const;
export type SkinVarName = (typeof SKIN_VAR_NAMES)[number];
