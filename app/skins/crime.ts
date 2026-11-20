/**
 * Crime city: an ORIGINAL generic night-city look, inspired by the genre only (reports/skins-design.md
 * T6). Wet asphalt, steel panels, neon sign colours, siren sweeps and rain. No game logo, font, art,
 * palette copy, wording, character or weapon imagery; abstract shapes only. Picker only (no routes).
 * The angled corners, glow outlines, scanlines and glitch wipe live in app.css, region `skin:crime`.
 */
import chakra400 from '@fontsource/chakra-petch/files/chakra-petch-latin-400-normal.woff2?url';
import oswald700 from '@fontsource/oswald/files/oswald-latin-700-normal.woff2?url';
import type { SkinSpec } from './types';

export const crime: SkinSpec = {
  id: 'crime',
  label: 'Crime city',
  blurb: 'Neon on wet asphalt, after midnight.',
  routes: [],
  lock: false,
  // The skin owns the surfaces; an equipped character only tints accents.
  surfaces: 'skin',
  colors: {
    bg: '#090c14',
    fg: '#e8edf6',
    card: '#131a28',
    cardFg: '#e8edf6',
    surface2: '#0d121d',
    muted: '#9fabc2',
    line: '#3b4a68',
    lineStrong: '#5d7099', // 3.9:1 on bg, 3.5:1 on card
    // Sodium amber (buttons), signage magenta, signage cyan.
    c1: '#ffb020',
    c2: '#ff2e93',
    c3: '#27e4f0',
    mood: 'dark',
    // Haze over asphalt: a cold blue pool top-left, a magenta haze bottom-right, a faint street grid.
    backdrop: [
      'radial-gradient(60rem 38rem at 12% -8%, rgb(39 228 240 / 0.1), transparent 70%)',
      'radial-gradient(52rem 34rem at 96% 104%, rgb(255 46 147 / 0.12), transparent 70%)',
      'linear-gradient(rgb(120 140 190 / 0.05) 1px, transparent 1px)',
      'linear-gradient(90deg, rgb(120 140 190 / 0.05) 1px, transparent 1px)',
      'linear-gradient(180deg, #0c1120, #090c14 55%, #070910)',
    ].join(', '),
    backdropSize: 'auto, auto, 48px 48px, 48px 48px, auto',
  },
  type: {
    display: '"Oswald", "Oswald Fallback", "Arial Narrow", "Arial Black", system-ui, sans-serif',
    head: '"Oswald", "Oswald Fallback", "Arial Narrow", system-ui, sans-serif',
    body: '"Chakra Petch", "Chakra Fallback", system-ui, sans-serif',
    fonts: [
      { pkg: 'oswald', weights: [400, 700] },
      { pkg: 'chakra-petch', weights: [400, 600] },
    ],
    fontFiles: {
      'oswald-latin-700-normal': oswald700,
      'chakra-petch-latin-400-normal': chakra400,
    },
    preload: ['oswald-latin-700-normal', 'chakra-petch-latin-400-normal'],
    fontLoaders: () =>
      Promise.all([
        import('@fontsource/oswald/latin-400.css'),
        import('@fontsource/oswald/latin-700.css'),
        import('@fontsource/chakra-petch/latin-400.css'),
        import('@fontsource/chakra-petch/latin-600.css'),
      ]),
    displayCase: 'uppercase',
    headCase: 'uppercase',
    displayTracking: '0.05em',
    headTracking: '0.08em',
    displayLeading: 1,
    displayWeight: 700,
    scale: 1,
    ui: '"Oswald", "Oswald Fallback", "Arial Narrow", system-ui, sans-serif',
    uiWeight: 700,
    uiTracking: '0.08em',
    kickerTracking: '0.16em',
    headLeading: 1.1,
  },
  shape: {
    radiusS: '2px',
    radiusM: '2px',
    radiusL: '2px',
    radiusPill: '2px',
    borderW: '2px',
    // A neon halo, not a drop: no offset, a wide blur, cyan at ~55%.
    shadowX: '0px',
    shadowY: '0px',
    shadowBlur: '12px',
    shadowSpread: '-1px',
    shadowColor: '#27e4f08c',
    tilt: '0deg',
    pattern: 'scanlines',
    buttonCase: 'uppercase',
  },
  motion: {
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeSnap: 'cubic-bezier(0.4, 0, 0.2, 1)',
    durFast: '0.12s',
    durBase: '0.18s',
    durSlow: '0.25s',
    hoverLift: 2,
    pressDepth: 2,
    spring: { stiffness: 420, damping: 30 },
    stagger: 0.04,
    entrance: 'slide',
    wipe: 'glitch',
    calm: false,
  },
  atmosphere: { kind: 'neon-rain', strength: 0.25 },
  icons: { stroke: 2, linecap: 'square' },
};
