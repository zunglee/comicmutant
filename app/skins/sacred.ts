/**
 * Indian Gods (Sacred India): the calm realm (reports/sacred-design.md S8). This one file IS the look
 * of /sacred/**: ivory ground, saffron, lotus pink, peacock teal, sandal-gold hairlines, deep indigo
 * text, a serif display face, soft shadows and slow motion. Components read it as CSS variables;
 * app.css holds only the realm's own components (cards, doors, atmosphere), all in these tokens.
 *
 * Locked to /sacred, so the realm stays calm whatever skin or character theme the visitor picked.
 * Contrast on ivory (#fbf5e6): indigo text 13.6:1, muted 7.4:1, c1Text 5.9:1, c3Text 6.6:1.
 *
 * Shape mapping (SKINS.md): radiusS = controls (pill buttons), radiusM = panels and fields,
 * radiusL = bubbles and hero cards, radiusPill = chips. Calm rule (T7): every duration is >= 0.4 s,
 * no tilt, no shake/flash/burst; test/sacred-skin.test.ts enforces it.
 */
import cormorant600 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2?url';
import mukta400 from '@fontsource/mukta/files/mukta-latin-400-normal.woff2?url';
import mukta600 from '@fontsource/mukta/files/mukta-latin-600-normal.woff2?url';
import type { SkinSpec } from './types';

export const sacred: SkinSpec = {
  id: 'sacred',
  label: 'Indian Gods',
  blurb: 'Ivory, saffron and peacock teal; slow, calm motion.',
  routes: ['/sacred'],
  lock: true,
  surfaces: 'skin',
  colors: {
    bg: '#fbf5e6', // ivory
    fg: '#1f2347', // deep indigo
    card: '#fffbf1',
    cardFg: '#1f2347',
    surface2: '#f5ecd6',
    muted: '#4a4f6e',
    line: '#d9c28f', // sandal, hairlines only
    lineStrong: '#a8843f', // darker sandal: 3.2:1 on ivory, 3.4:1 on card (line stays a hairline)
    c1: '#e8892f', // saffron
    c2: '#c2417a', // lotus pink
    c3: '#1d7a7c', // peacock teal
    mood: 'light',
    // Hand-picked realm text colours (5.9:1 and 6.6:1 on ivory).
    c1Text: '#9a4a05',
    c3Text: '#0f6467',
    // Three soft washes: saffron dawn on top, lotus bottom right, peacock bottom left.
    backdrop:
      'radial-gradient(ellipse 70% 40% at 50% -5%, rgb(232 137 47 / 0.2), transparent 70%), radial-gradient(ellipse 60% 40% at 90% 100%, rgb(194 65 122 / 0.12), transparent 70%), radial-gradient(ellipse 60% 40% at 5% 80%, rgb(29 122 124 / 0.1), transparent 70%)',
  },
  type: {
    // "Sacred Serif/Sans Fallback" are metric-matched stand-ins (app.css) so a late web font never
    // re-wraps the header. Tiro covers Devanagari; Gurmukhi is loaded by the routes that need it.
    display:
      '"Cormorant Garamond", "Sacred Serif Fallback", "Tiro Devanagari Hindi", Georgia, serif',
    head: '"Cormorant Garamond", "Sacred Serif Fallback", "Tiro Devanagari Hindi", Georgia, serif',
    body: '"Mukta", "Sacred Sans Fallback", "Tiro Devanagari Hindi", system-ui, sans-serif',
    fonts: [
      { pkg: 'cormorant-garamond', weights: [400, 600] },
      { pkg: 'mukta', weights: [400, 600] },
      { pkg: 'tiro-devanagari-hindi', weights: [400], subset: 'devanagari' },
    ],
    // The one place sacred fonts are preloaded (root.tsx); the /sacred routes add no links of their own.
    fontFiles: {
      'cormorant-garamond-latin-600-normal': cormorant600,
      'mukta-latin-400-normal': mukta400,
      'mukta-latin-600-normal': mukta600,
    },
    preload: [
      'cormorant-garamond-latin-600-normal',
      'mukta-latin-400-normal',
      'mukta-latin-600-normal',
    ],
    // Per-weight CSS for Devanagari-capable families: unicode-range keeps Hindi subsets off English pages.
    fontLoaders: () =>
      Promise.all([
        import('@fontsource/cormorant-garamond/latin-400.css'),
        import('@fontsource/cormorant-garamond/latin-600.css'),
        import('@fontsource/mukta/400.css'),
        import('@fontsource/mukta/600.css'),
        import('@fontsource/tiro-devanagari-hindi/400.css'),
      ]),
    displayCase: 'none',
    headCase: 'none',
    displayTracking: '0',
    headTracking: '0',
    displayLeading: 1.1,
    displayWeight: 600,
    scale: 1.04,
    // Controls and kickers read in the body face, semibold (was a leftover app.css rule).
    ui: '"Mukta", "Sacred Sans Fallback", "Tiro Devanagari Hindi", system-ui, sans-serif',
    uiWeight: 600,
    uiTracking: '0.01em',
    kickerTracking: '0.18em',
    headLeading: 1.1,
  },
  shape: {
    radiusS: '999px', // pill buttons
    radiusM: '18px', // panels, fields
    radiusL: '18px', // bubbles
    radiusPill: '999px', // chips
    borderW: '1px',
    // Soft, wide shadow with a negative spread: it lifts a card without outlining it.
    shadowX: '0px',
    shadowY: '10px',
    shadowBlur: '34px',
    shadowSpread: '-12px',
    shadowColor: 'rgb(31 35 71 / 0.22)',
    tilt: '0deg',
    pattern: 'none',
    buttonCase: 'none',
  },
  motion: {
    // One slow ease-out, no overshoot: nothing snaps in the realm.
    easeOut: 'cubic-bezier(0.22, 0.8, 0.3, 1)',
    easeSnap: 'cubic-bezier(0.22, 0.8, 0.3, 1)',
    durFast: '0.6s',
    durBase: '0.7s',
    durSlow: '1.4s',
    hoverLift: 2,
    pressDepth: 0,
    spring: { stiffness: 90, damping: 20 },
    stagger: 0.12,
    entrance: 'fade',
    wipe: 'dusk',
    calm: true,
  },
  atmosphere: { kind: 'petals-diyas', strength: 0.25 },
  icons: { stroke: 1.6, linecap: 'round' },
};
