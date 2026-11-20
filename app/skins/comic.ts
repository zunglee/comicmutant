/**
 * Superhero comic — the house look ("halftone pop"). PLACEHOLDER by T-core: today's :root fallback
 * values; T-comic replaces this file's contents with the full spec. Surfaces follow the equipped
 * character theme (T3), so the 100 character themes look exactly as before.
 */
import bangers400 from '@fontsource/bangers/files/bangers-latin-400-normal.woff2?url';
import chakra400 from '@fontsource/chakra-petch/files/chakra-petch-latin-400-normal.woff2?url';
import russo400 from '@fontsource/russo-one/files/russo-one-latin-400-normal.woff2?url';
import type { SkinSpec } from './types';

export const comic: SkinSpec = {
  id: 'comic',
  label: 'Superhero comic',
  blurb: 'Ink outlines, halftone dots and loud colour.',
  routes: [],
  lock: false,
  surfaces: 'character',
  colors: {
    bg: '#12101a',
    fg: '#f6f1e7',
    card: '#241523',
    cardFg: '#f6f1e7',
    surface2: '#1a1522',
    muted: '#b9b1a6',
    line: '#000000',
    c1: '#ff2e4d',
    c2: '#1b1464',
    c3: '#ffd400',
    mood: 'dark',
    backdrop: '',
  },
  type: {
    display: '"Bangers", "Bangers Fallback", "Impact", system-ui, sans-serif',
    head: '"Russo One", "Russo Fallback", "Arial Black", system-ui, sans-serif',
    body: '"Chakra Petch", "Chakra Fallback", system-ui, sans-serif',
    fonts: [
      { pkg: 'bangers', weights: [400] },
      { pkg: 'russo-one', weights: [400] },
      { pkg: 'chakra-petch', weights: [400, 600] },
    ],
    fontFiles: {
      'bangers-latin-400-normal': bangers400,
      'russo-one-latin-400-normal': russo400,
      'chakra-petch-latin-400-normal': chakra400,
    },
    preload: [
      'bangers-latin-400-normal',
      'russo-one-latin-400-normal',
      'chakra-petch-latin-400-normal',
    ],
    fontLoaders: () =>
      Promise.all([
        import('@fontsource/bangers/latin-400.css'),
        import('@fontsource/russo-one/latin-400.css'),
        import('@fontsource/chakra-petch/latin-400.css'),
        import('@fontsource/chakra-petch/latin-600.css'),
      ]),
    displayCase: 'none',
    headCase: 'none',
    displayTracking: '0.03em',
    headTracking: '0.01em',
    displayLeading: 0.92,
    displayWeight: 400,
    scale: 1,
    // Buttons/chips/kickers in the head face, today's tracking.
    ui: '"Russo One", "Russo Fallback", "Arial Black", system-ui, sans-serif',
    uiWeight: 400,
    uiTracking: '0.04em',
    kickerTracking: '0.16em',
    headLeading: 1.1,
  },
  shape: {
    radiusS: '6px',
    radiusM: '6px',
    radiusL: '18px',
    radiusPill: '999px',
    borderW: '3px',
    shadowX: '5px',
    shadowY: '5px',
    shadowBlur: '0px',
    shadowColor: 'var(--line)',
    tilt: '1.6deg',
    pattern: 'dots',
    buttonCase: 'uppercase',
  },
  motion: {
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeSnap: 'cubic-bezier(0.2, 1.4, 0.4, 1)',
    durFast: '0.12s',
    durBase: '0.2s',
    durSlow: '0.45s',
    hoverLift: 2,
    pressDepth: 3,
    spring: { stiffness: 260, damping: 22 },
    stagger: 0.06,
    entrance: 'pop',
    wipe: 'halftone',
    calm: false,
  },
  atmosphere: { kind: 'comic-fx', strength: 0.25 },
  icons: { stroke: 2.4, linecap: 'round' },
};
