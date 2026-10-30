# Performance

## Budgets

| What | Budget | How measured |
|---|---|---|
| JS per content page (gz, first load) | ≤ 160 KB | `pnpm build` output, sum of the route's chunks |
| Motion animation features | lazy, never in first paint | `LazyMotion` + `motion-features` chunk |
| Game code | 0 KB on non-game pages; one chunk per game | dynamic `import()` in `arena-play.tsx` |
| Theme pack | ≤ 2 KB, downloaded only on Get/equip | `/themes/pack/:slug` |
| Live animated clips | ≤ 14 at once, none off screen, ≤ 30 fps, none before load + idle; grid cards on hover only | `ClipCanvas` scheduler |
| CLS | 0 | clips reserve `aspect-ratio`; images carry width/height |
| Atmosphere | one canvas, ≤ 30 fps, ≤ ~40 particles, after load + idle, paused when the tab is hidden | `atmosphere.tsx` |
| Loaders | intro ≤ 1.8 s once per session, transit 0.75 s, exit 0.2 s; navigation never waits on them | `loaders.tsx` |

## Why it stays light with 139 themes × ~20 clips

- Clips are **recipes, not files**: 26 motif recipes, 19 of which pass the gate (~12.6 KB gz, lazy) + the sprite rig (~17 KB gz, originals
  pages only) generate every "GIF" in the browser. 2,600 GIF files would be hundreds of MB.
- One `requestAnimationFrame` loop drives every clip on the page; clips pause when off screen
  (IntersectionObserver), cap device-pixel-ratio at 2, and paint a single still frame in Lite mode or
  under `prefers-reduced-motion`.
- The theme catalogue ships rows only (name, swatch, tagline, group tags); packs download on demand and
  are cached in localStorage + HTTP cache (versioned URL).
- The current theme and top-5 are read from cookies during SSR and painted inline on `<html>`, so there is
  no theme flash and no extra request on load.
- Roster search/filter/sort/paging run in the loader; a page ships 30 cards, not the whole roster.
- Above-the-fold headline motion animates position only — text is visible in server HTML (LCP is not
  gated on JS).

## Measured (2026-10-30, production build)

Client chunks (gzip): entry.client 69.8 KB · router components 40.3 KB · shared bits 29.1 KB ·
motion features 28.5 KB (lazy) · clip registry 7.1 KB · character route 8.9 KB · root CSS 9.4 KB.
Sprite rig 17.1 KB + sprite fx 18.2 KB load only on originals/arena pages.

After the efficiency re-audit: motion features 14.7 KB gz (domAnimation), sprite rig lazy, no zod on the client,
halftone and sprite backdrops cached as bitmaps. Lighthouse and the full table: `reports/2026-10-30-build.md`.
