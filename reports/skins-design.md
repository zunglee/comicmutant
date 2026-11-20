# Skins — one place to change the site's theme (Batman run 3, 2026-11-20)

Owner ask: "all components should be standardised so that if I want to change the theme it is easy to
just update the component — superhero, GTA, Indian Gods, Indian superheroes (Shaktimaan, Doga, Nagraj)."
Owner answers (AskUserQuestion): depth = **look and feel** (not wording, not layouts); first skins =
**Superhero comic, Indian Gods (Sacred), Crime city (GTA-style), Desi heroes**; switching = **both** a
picker and per-section defaults, choice remembered; character themes = **site skin + character accent**.

## Rulings (decided by engineering under owner delegation)

- **T1 A skin is a typed spec, not CSS.** `app/skins/<id>.ts` exports a `SkinSpec` (app/skins/types.ts:
  colours, type, shape, motion, atmosphere, icons). `skinVars()` turns it into the CSS variables in
  `SKIN_VAR_NAMES`; components read only those variables (or `useSkin()` for JS-side motion). A new theme
  is one new file + one registry line; changing a theme is editing one file.
- **T2 Components are primitives.** `app/components/ui/*` (Button, Panel, Chip, Field, Heading, Kicker,
  Badge, Tabs, Stat, Section…) and the `@layer components` classes (`.btn`, `.panel`, `.chip`…) take
  every colour, font, radius, shadow, easing and duration from tokens. Pages compose primitives; no raw
  hex, no font-family, no hard-coded easing outside `app/skins/**` and `app/lib/theme/**`. A "token
  police" unit test scans `app/**` for violations against a shrinking baseline; the baseline may only
  go down.
- **T3 Surfaces policy.** Each skin declares `surfaces`: `'character'` (comic: the equipped character
  theme drives the page surfaces — this keeps the 100-theme product feature exactly as today) or `'skin'`
  (sacred, crime, desi: the skin owns bg/fg/card/line, the character's palette only tints accents). This
  is the owner's "site skin + character accent" for the three new skins; comic keeps its existing
  per-character look because that IS its product. Flag to owner in the report.
- **T4 Selection.** SSR picks the skin before first paint (no flash): `lock` skins win on their routes
  (Sacred, S8: the realm stays calm whatever the user picked); otherwise the user's pinned choice
  (cookie `cm_skin`, set by the picker); otherwise the route default (`/desi` and Indian character pages →
  desi; everything else → comic). Crime has no section: picker only. `data-skin` on `<html>` replaces
  `data-realm` (a `data-realm="sacred"` alias is kept for one release so existing selectors/tests work).
- **T5 Fonts load per skin.** Only the active skin's fonts are preloaded; others load on demand.
  Per-skin fallback faces use size-adjust (CLS < 0.05).
- **T6 IP.** "Crime city" is an original generic night-city style: no GTA logos, fonts, art, palette copies
  or wording; "Desi heroes" uses generic Indian-comic colours and type, no published character art
  (README Hybrid rule unchanged).
- **T7 Calm skins are enforced.** `motion.calm` skins (sacred) have no animation < 0.4 s and no
  shake/flash keyframes; a test greps their CSS.
- **T8 Acceptance.** Every skin passes AA contrast on all text pairs (unit test); every page renders in
  all four skins with no horizontal scroll at 375 px (e2e sweep); comic skin looks identical to today
  (screenshot diff ≤ 0.5% on 8 key pages); switching a skin never reloads the page (wipe transition).

## Work table

| Piece | Owner (model) | Files |
|---|---|---|
| T-core: spec registry, skinVars, AA enforcement, SSR selection, cookie, `useSkin`, picker API, motion tokens plumbing | batman-core (opus) | app/skins/{compute,registry,context}.tsx, root.tsx skin bits, app/routes/api/skin.ts |
| T-prims: tokenise `@layer components`, `app/components/ui/*` primitives, migrate shared components, token-police test | batman-builder (sonnet) | app/app.css (non-sacred), app/components/**, test/token-police.test.ts |
| T-comic + T-sacred: express today's comic look and the sacred realm as specs; delete `html[data-realm]` overrides | batman-builder (sonnet) | app/skins/comic.ts, sacred.ts, app.css sacred region |
| T-crime + T-desi: new skins incl. atmospheres, fonts, patterns | batman-builder (sonnet) | app/skins/crime.ts, desi.ts, app/components/atmosphere.tsx additions |
| T-picker: skin picker UI + wipe transition + section defaults wiring | batman-builder (sonnet) | chrome.tsx picker, app/components/skin-picker.tsx |
| Critics | batman-critic (opus) fresh each round; Alfred blind score | — |

## Round-1 critic rulings (2026-11-20; scores: standardisation 5, comic 8, sacred 5, crime 7, desi 5, picker 8, a11y 6)

- **K1 A skin = its spec + its css + (optional) atmosphere.** `app/skins/<id>.ts`, `app/skins/css/<id>.css`
  (scoped `html[data-skin="<id>"]`, tokens only), one registry line. `SkinId` derives from the registry;
  per-skin font loaders live in the spec. No skin look in shared `app.css`.
- **K2 Readability can't be faked.** Backdrop must not paint opaque hex over `--bg`; a rendered
  axe-contrast matrix spec loops over every registered skin so a new skin is covered automatically.
- **K3 Calm is a property of the skin, not the URL.** Loader, easter eggs, dock, transitions, animation
  durations all read `motion.calm` / `useSkinMotion()`; `data-realm` only on the real Sacred route.
- **K4 Character pages follow T3.** Under `surfaces:'skin'` skins a character page keeps the skin's
  surfaces and takes only accents from the character. Comic unchanged.
- **K5 Fonts per script, per need.** Devanagari/Gurmukhi faces use unicode-range: zero script bytes on
  Latin-only pages (measured on a production build).
- **K6 No flag.** Desi wipe/atmosphere never reproduce saffron-white-green bands; the atmosphere is
  `marigold-dust`; tests reject flag/emblem words.
- **K7 Preference cookies make a page private** (`cm_skin`, `cm_theme`, voter cookies).
- **K8 Token police sees everything**: rgb/hsl, named colours, `fontFamily=`, fixed `rounded-*`,
  `duration-*`, Motion duration literals; baseline records reality and may only fall.

## Engine rulings for the round-1 fixes (T-core, 2026-11-20)

- **S18 Backdrops are checked against the text** (K2). The engine parses every colour in
  `colors.backdrop`, blends it over `--bg` at its own alpha, and needs `--fg`, `--muted`, `--c1-text` and
  `--c3-text` at 4.5:1 on it. That allows an opaque base layer only when it is readable (crime's night
  gradient passes; a light copy fails). Colour it can't check (hsl, color-mix, named colours, url
  images) is refused. At runtime a failing backdrop is dropped (`--backdrop: none`), never painted.
  `backdropProblems(spec)` names the problem, and the e2e matrix measures the real render with axe.
- **S19 Calm reads the skin; navigation reads the URL** (K3). LoaderStage (intro and page sweeps),
  EasterEggs and ThemeDock mount only when `!spec.motion.calm`. `useDur()` in the learn games, petal
  vs burst celebrations and swipe distances read `calm`. Two things stay on the URL or content realm by
  design: the Sacred header, tabs and footer, which are section navigation (pinning sacred on `/` must
  not swap the site's nav for the Sacred section's links), and game wording. `data-realm="sacred"` is
  written only when sacred wins by `lock` on its own routes (`realmOf()`), never when it is merely
  pinned.
- **S20 Motion tokens.** `useSkinMotion()` / `skinMotion(spec)` give `spring`, `tween`, `delay`,
  `entrance`, `durations`, `ease`, `calm`, `scaleSpring`. A call site keeps its comic-tuned numbers and
  the hook scales them by the skin's ratio to comic (comic's ratio is 1 by construction, so comic is
  pixel-identical). A calm skin gets a tween of at least max(0.4 s, durFast) instead of any spring.
  Entrance variants move position and scale only, never opacity, so SSR text stays visible.
  `icons.style` is deleted (never read); icons keep `stroke` and `linecap`.
- **S21 Script fonts by unicode-range** (K5). Mukta, Tiro Devanagari Hindi, Yatra One and Noto Sans
  Gurmukhi load from fontsource per-weight CSS (`400.css`), whose every @font-face has a unicode-range.
  The bare `devanagari-400.css` / `gurmukhi-400.css` files have none, which is why they downloaded
  everywhere. A unit test forbids them; the e2e matrix asserts no Devanagari/Gurmukhi font request on
  `/`, `/roster` and `/about` in every skin (production build).
- **S22 Preference cookies make a page private** (K7). `cachePolicy` serves `private, no-store` when
  any of `cm_skin`, `cm_theme`, `cm_top5` or `cm_fx` is present (as for voter cookies). Only pages for
  a browser with no preference stay publicly cacheable.
- **S23 One registry line** (K1). `SKINS = {…} as const` is the list; `SkinId = keyof typeof SKINS`
  and `SKIN_IDS = Object.keys(SKINS)`. Each spec declares `type.fontFiles` (key → woff2 URL) and
  `type.fontLoaders`; `FONT_URLS`, `preloadHrefs` and `skinFontImports` are derived and kept for
  existing callers.
- **S24 Accent text is readable on both surfaces** (critic: /c/doga kicker 4.48:1). `--c1-text` and
  `--c3-text` reach `TEXT_MIN` = 4.6:1 against BOTH `--bg` and `--card` (`--c1-text-card` against the
  card), in `themeVars`, `skinVars` and the accent layer. `RULES_VERSION` 3, so every pack's cache key
  changes. A test covers every shipped theme on every skin.
