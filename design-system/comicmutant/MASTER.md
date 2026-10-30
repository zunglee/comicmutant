# ComicMutant — design system (MASTER)

Generated with the UI-UX Pro Max skill (`--design-system`, variance 8 · motion 9 · density 5) and then
edited to match what the site actually implements. Page files in `pages/` override this one.
Source of truth for tokens is code: `app/app.css` (`@theme inline`), `app/lib/theme/compute.ts`.

## Style

**Halftone pop (neo-brutalist comic).** Thick ink outlines (3px), hard offset shadows (`shadow-ink`),
halftone dot fields, speech bubbles, starbursts, slight panel tilts. Flat colour only: no gradients or
glass except the scheduled atmosphere layer. Pattern: feature-rich showcase — hero, five portals,
trending grid, rumour + versus, arena CTA.

## Colour

Every colour is a theme variable computed per character from 3 palette colours + mood
(`themeVars()`); every text pair is pushed to WCAG AA (4.5:1) and a unit test checks all 130 themes.

| Token | Role |
|---|---|
| `--c1` / `--c2` / `--c3` | signature / second / accent (fills) |
| `--on-c1..3` | ink or paper text on those fills (≥3:1) |
| `--bg` / `--fg`, `--card` / `--card-fg`, `--muted` | surfaces and text |
| `--c1-text`, `--c1-text-card`, `--c3-text` | palette colours adjusted for text contrast |
| `--line` | ink outlines |
| `--halftone`, `--glow` | dot fields, focus/accents |

Rule: never raw hex in components; a card painted in another character's colours uses `scopeVars()`.

## Typography

| Use | Font | Notes |
|---|---|---|
| Display | Bangers 400 | headlines, SFX lettering, ink-text shadow |
| Headings / UI | Russo One 400 | buttons, chips, kickers (uppercase, tracking) |
| Body | Chakra Petch 400/600 | 16px base, 1.5 line height |

All self-hosted (`@fontsource`), Latin subset; Bangers + Chakra 400 preloaded.

## Components

`.panel`, `.panel-c1`, `.btn` (+`.btn-c1`, `.btn-c3`, `.btn-sm`), `.chip` (`aria-pressed` = on),
`.field`, `.bubble`, `.burst`, `.halftone`, `.kicker`, `.h-display`, `.ink-text` — in
`@layer components` so Tailwind utilities can override them. Buttons ≥44px, press = translate into
shadow, hover = lift.

## Motion (Motion 14, `LazyMotion` + `domAnimation`)

| Pattern | Timing | Rule |
|---|---|---|
| Entrances (cards, panels) | spring 260/22, stagger ≤ 0.18s | position/scale only above the fold (text visible in SSR HTML) |
| Headline letters | spring 380–500 / 14–16 | settle within ~0.6s |
| Theme switch | halftone circle wipe, 0.6s | from the clicked swatch |
| Page transition | overlay at the root; entrance 150ms, exit 100ms; lifts when the route is idle (min 400ms, max 900ms) | never blocks navigation; clicks pass through; skippable; not on Back/Forward |
| Intro loader | ≤ 2.6s, first visit per session | click/Esc/Skip ends it; server renders the curtain, which lifts by CSS at 2.6s and is hidden without JS |
| Atmosphere | ≤ 30fps, starts after load + idle, pauses when hidden; 25% strength over the reading column | off in Lite FX and reduced motion |
| Clips (canvas) | ≤ 30fps, ≤ 14 live, grid cards on hover | still frame in Lite/reduced motion |

Exit is always faster than entrance. `prefers-reduced-motion` → final states immediately, no loaders,
no atmosphere, no shake/flash.

## Anti-patterns

- Emoji as icons (inline SVG only); hover-only affordances; text under 12px.
- Translucent/airbrushed clip art; mixed tints outside the palette (clip quality gate).
- Animating width/height/top/left; layout animations on long lists.
- Drawing real characters (IP rule: originals only for figures).

## Pre-delivery checklist

Last audited 2026-10-30 (25 findings, all fixed — `reports/2026-10-30-build.md`).


- [x] Contrast: body 4.5:1, large 3:1, on every theme (unit test) and inside scoped cards
- [x] Focus visible on every control; keyboard reaches everything; skip link
- [x] Touch targets ≥ 44px; nothing hover-only
- [x] `prefers-reduced-motion` and Lite FX respected (loaders, atmosphere, clips, shake)
- [x] No horizontal scroll at 375px; CLS < 0.1; images sized; fonts preloaded
- [x] No emoji icons; SVG icons with labels when standalone
- [x] Loading / empty / error states on every data view
- [x] axe: 0 serious/critical on every public page (e2e)
