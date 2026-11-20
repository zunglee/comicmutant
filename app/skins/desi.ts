/**
 * Desi heroes: the look of Indian superhero comics and film posters, in generic original form
 * (T6/IP: palette, pattern and type only; no published figure, logo or art; no flag, no Ashoka
 * chakra: national symbols are regulated). Default on /desi and on Indian character pages
 * (app/skins/select.ts); also in the picker. Surfaces belong to the skin, so a character's own
 * colours tint accents only.
 *
 * Why a light-warm ground: print posters are inks on warm paper, and the navy line then reads as the
 * key-line and the hard offset shadow. A navy ground would swallow both. Cream paper (#fff3dc), navy
 * ink (#17204d), vermilion c1, emerald c2, marigold c3: every text pair is AA (skinVars enforces it).
 *
 * Backdrop: one warm gradient (saffron glow at the top, emerald hint at the foot). The jaali lattice
 * is drawn over it by the `desi-only` region of app.css (it needs a second tile size, which the
 * single --backdrop-size token cannot give), so `pattern` is 'none'.
 */
import mukta400 from '@fontsource/mukta/files/mukta-latin-400-normal.woff2?url';
import teko600 from '@fontsource/teko/files/teko-latin-600-normal.woff2?url';
import yatra400 from '@fontsource/yatra-one/files/yatra-one-latin-400-normal.woff2?url';
import type { SkinSpec } from './types';

export const desi: SkinSpec = {
  id: 'desi',
  label: 'Desi heroes',
  blurb: 'Saffron, emerald and navy ink: Indian comic posters, loud and proud.',
  routes: ['/desi'],
  lock: false,
  surfaces: 'skin',
  colors: {
    bg: '#fff3dc',
    fg: '#17204d',
    card: '#fffaf0',
    cardFg: '#17204d',
    surface2: '#ffe5b4',
    muted: '#4f4636',
    line: '#17204d',
    c1: '#e8431f',
    c2: '#0b7a4b',
    c3: '#ff9f1c',
    mood: 'light',
    c1Text: '#b3260b',
    c3Text: '#8a4a00',
    backdrop:
      'linear-gradient(180deg, rgb(255 159 28 / 0.22) 0, transparent 36%, transparent 78%, rgb(11 122 75 / 0.14) 100%)',
  },
  type: {
    // Yatra One has Latin and Devanagari in one bold poster face; Teko is the condensed
    // headline/label face; Mukta carries Latin and Devanagari body copy.
    display: '"Yatra One", "Tiro Devanagari Hindi", "Impact", system-ui, sans-serif',
    head: '"Teko", "Arial Narrow", "Tiro Devanagari Hindi", system-ui, sans-serif',
    body: '"Mukta", "Tiro Devanagari Hindi", system-ui, sans-serif',
    fonts: [
      { pkg: 'yatra-one', weights: [400] },
      { pkg: 'yatra-one', weights: [400], subset: 'devanagari' },
      { pkg: 'teko', weights: [600] },
      { pkg: 'mukta', weights: [400, 600] },
    ],
    fontFiles: {
      'yatra-one-latin-400-normal': yatra400,
      'teko-latin-600-normal': teko600,
      'mukta-latin-400-normal': mukta400,
    },
    preload: ['yatra-one-latin-400-normal', 'teko-latin-600-normal', 'mukta-latin-400-normal'],
    // Per-weight CSS for Devanagari-capable families: unicode-range keeps Hindi subsets off English pages.
    fontLoaders: () =>
      Promise.all([
        import('@fontsource/yatra-one/400.css'),
        import('@fontsource/teko/latin-600.css'),
        import('@fontsource/mukta/400.css'),
        import('@fontsource/mukta/600.css'),
      ]),
    displayCase: 'uppercase',
    headCase: 'uppercase',
    displayTracking: '0.02em',
    headTracking: '0.05em',
    displayLeading: 1,
    displayWeight: 400,
    scale: 1,
    ui: '"Teko", "Arial Narrow", "Tiro Devanagari Hindi", system-ui, sans-serif',
    uiWeight: 600,
    uiTracking: '0.05em',
    kickerTracking: '0.1em',
    headLeading: 1.1,
  },
  shape: {
    radiusS: '8px',
    radiusM: '12px',
    radiusL: '20px',
    radiusPill: '999px',
    borderW: '3px',
    shadowX: '5px',
    shadowY: '5px',
    shadowBlur: '0px',
    shadowColor: 'var(--line)',
    tilt: '1deg',
    pattern: 'none',
    buttonCase: 'uppercase',
  },
  motion: {
    easeOut: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
    easeSnap: 'cubic-bezier(0.25, 1.25, 0.45, 1)',
    durFast: '0.15s',
    durBase: '0.22s',
    durSlow: '0.3s',
    hoverLift: 2,
    pressDepth: 3,
    spring: { stiffness: 200, damping: 20 },
    stagger: 0.06,
    entrance: 'pop',
    wipe: 'saffron',
    calm: false,
  },
  // strength = the dust's opacity over the reading column (the edges run at full strength).
  atmosphere: { kind: 'marigold-dust', strength: 0.25 },
  icons: { stroke: 2.4, linecap: 'round' },
};
