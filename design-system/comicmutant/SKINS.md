# Skins: how to change the theme

A **skin** is the site-level look and feel: colours, type, shape (radius, border, shadow, tilt), motion,
atmosphere and icon stroke. Components never hold those values; they read CSS variables. Changing the
theme of the whole site is editing one file.

## Change a theme

1. Edit `app/skins/<id>.ts` (`comic`, `sacred`, `crime`, `desi`). It exports a typed `SkinSpec`
   (`app/skins/types.ts`).
2. `skinVars()` turns the spec into the variables below and `root.tsx` writes them on `<html>` during
   SSR (no flash).
3. New skin: copy the template below to `app/skins/<id>.ts` and add ONE line to `SKINS` in
   `app/skins/registry.ts`. `SkinId`, `SKIN_IDS`, the picker, font preloads and font loaders all derive
   from it. Only if tokens can't say something, add `app/skins/css/<id>.css` and its `@import` line in
   `app/app.css`. No component changes. The unit tests and the e2e matrix
   (`test/e2e/12-skins-matrix.spec.ts`) pick the new skin up automatically.

Character themes (the 100 per-character palettes) keep writing `--c1..--c3` and friends on top.

## What a skin is

**A skin = `app/skins/<id>.ts` + `app/skins/css/<id>.css` + (optional) an atmosphere component.**
The spec carries every token. The css file holds only what tokens cannot say (a clip-path on buttons, a
ribbon on kickers, ornament, keyframes): selectors scoped `html[data-skin="<id>"]`, values read from
tokens. It is pulled in by `@import "./skins/css/<id>.css"` at the top of `app/app.css`. Raw colours,
fonts and easing may live in `app/skins/**` (the token police skips it); they may not live anywhere else.
Optional extras a skin sets in its css: `--kicker-size`, `--logo-max-vw` (wordmark shrinks to this width on
phones: wide display faces), `--ink-offset`.

## Skin template

```ts
// app/skins/ocean.ts: then add `ocean` to SKINS in registry.ts. That's all.
import body400 from '@fontsource/<pkg>/files/<pkg>-latin-400-normal.woff2?url';
import type { SkinSpec } from './types';

export const ocean: SkinSpec = {
  id: 'ocean',                       // must equal the registry key (unit test)
  label: 'Ocean', blurb: 'One line for the picker.',
  routes: [],                        // section defaults, e.g. ['/ocean']; [] = picker only
  lock: false,                       // true = wins on its routes AND ignores the character theme
  surfaces: 'skin',                  // 'character' only for comic (character palette paints the page)
  colors: {
    bg: '#…', fg: '#…', card: '#…', cardFg: '#…', surface2: '#…', muted: '#…',
    line: '#…', lineStrong: '#…',    // lineStrong: control borders, >= 3:1 on bg and card
    c1: '#…', c2: '#…', c3: '#…', mood: 'light',
    // Every colour here is checked against the text (S18): #hex, rgb()/rgba() or var(--token) only.
    // An opaque stop must keep --fg/--muted/--c1-text/--c3-text at 4.5:1, or the backdrop is dropped.
    backdrop: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgb(0 90 160 / 0.12), transparent 70%)',
  },
  type: {
    display: '"Face", "Face Fallback", system-ui, sans-serif', head: '…', body: '…',
    ui: '…', uiWeight: 600, uiTracking: '0.02em', kickerTracking: '0.14em', headLeading: 1.1,
    fonts: [{ pkg: '<pkg>', weights: [400] }],
    fontFiles: { '<pkg>-latin-400-normal': body400 },   // what `preload` may name
    preload: ['<pkg>-latin-400-normal'],               // above-the-fold faces only
    // Per-weight CSS (`400.css`) for scripts beyond Latin: it carries unicode-range (S21).
    fontLoaders: () => Promise.all([import('@fontsource/<pkg>/latin-400.css')]),
    displayCase: 'none', headCase: 'none', displayTracking: '0', headTracking: '0',
    displayLeading: 1, displayWeight: 400, scale: 1,
  },
  shape: { radiusS: '8px', radiusM: '12px', radiusL: '18px', radiusPill: '999px', borderW: '2px',
    shadowX: '0px', shadowY: '6px', shadowBlur: '18px', shadowColor: 'rgb(0 0 0 / 0.2)',
    tilt: '0deg', pattern: 'none', buttonCase: 'none' },
  motion: { easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)', easeSnap: 'cubic-bezier(0.2, 1.4, 0.4, 1)',
    durFast: '0.14s', durBase: '0.24s', durSlow: '0.5s', hoverLift: 2, pressDepth: 2,
    spring: { stiffness: 240, damping: 22 }, stagger: 0.06,
    entrance: 'rise', wipe: 'dusk', calm: false },   // calm: true => nothing under 0.4 s, no springs
  atmosphere: { kind: 'comic-fx', strength: 0.2 },
  icons: { stroke: 2, linecap: 'round' },
};
```

## Motion in components (`useSkinMotion()`, S20)

Never type a Motion duration, spring or stagger into a component. Write the value you tuned on comic
and pass it through the hook; it is scaled by the active skin (comic = unchanged, calm = a slow tween):

```tsx
const mo = useSkinMotion();
<m.li initial={mo.entrance.initial} animate={mo.entrance.animate}
  transition={mo.spring({ stiffness: 420, damping: 15 }, mo.delay(i, 0.04))} />
<m.div exit={{ opacity: 0, transition: mo.tween(0.1) }} />
```

`mo.calm` replaces `isSacredPath()` / `realm === 'sacred'` for anything that is look or motion. Section
navigation (the Sacred header, tabs and footer) and wording still follow the URL or the content realm.

## Variables (the contract, `SKIN_VAR_NAMES`)

Fallbacks in `:root` of `app/app.css` equal the comic values, so the site renders the same with no
engine. Lengths carry their unit (`--hover-lift: 2px`, `--tilt: 1.6deg`, `--shadow-blur: 0px`);
`--backdrop` is `none` when flat.

| Group | Variables | Used by |
|---|---|---|
| Colour | `--bg --fg --card --card-fg --surface-2 --muted --line --c1..c3 --on-c1..c3 --btn-c1 --c1-text --c1-text-card --c3-text --glow --halftone` | everything (`bg-card`, `text-fg`, `border-line`, `bg-c1`...) |
| Page | `--backdrop` (image list, `none` = flat), `--pattern-image` (body texture; size via optional `--pattern-size`, default `14px 14px`) | `body` |
| Type | `--font-display --font-head --font-body --display-case --head-case --button-case --display-tracking --head-tracking --display-leading --head-leading --display-weight --type-scale` | `.h-display .h-head`, `font-display/head/body`, `html` font-size |
| UI type | `--font-ui --ui-weight --ui-tracking --kicker-tracking` (chips use `--ui-tracking` + 0.01em) | `.btn .chip .kicker` |
| Radius | `--radius-s` controls (buttons, nav links), `--radius-m` surfaces (panel, field), `--radius-l` bubbles/hero, `--radius-pill` chips | `.btn .panel .field .bubble .chip`, `rounded-skin-*` |
| Border | `--control-line` (control outline colour: `.btn .chip .field`; falls back to `--line`; comic = `--line`, other skins their 3:1 border), `--border-w` (derived `--border-w-s` = max(1px, w-1px) for chips and dividers) | `.panel .btn .field`, `border-skin`, `border-skin-s` |
| Shadow | `--shadow-x --shadow-y --shadow-blur --shadow-spread --shadow-color` (colour optional; falls back to `--line`) | `shadow-ink`, `shadow-ink-sm` (x0.6), `shadow-ink-lg` (x1.8), `--shadow-ink-hover`, `.ink-text` |
| Tilt | `--tilt` (comic 1.6deg; 0deg for calm skins) | `.tilt-l .tilt-r`, `tilt-skin-1/2/3`, `tilt-skin-r-1` |
| Motion | `--ease-out --ease-snap --dur-fast --dur-base --dur-slow --hover-lift --press-depth` | `.btn .qz-opt`, `ease-snap`, `ease-skin`, `lift-skin` |
| Icons | `--icon-stroke --icon-linecap` | the SVG icon set (`icons.tsx`) |

Optional extras with built-in defaults (a skin may set them): `--halftone-image` / `--halftone-size`
(the fine dots on `.halftone`; `none` turns them off), `--field-inset` (inset shadow colour of fields),
`--focus-radius`, `--backdrop-size`, `--ink-offset` (display-type ink shadow offset, default 3px).

Fixed print colours (`--print-ink --print-paper --print-paper-muted --print-pop --print-alert`,
`--qz-ok/bad/warn/flash`, blueprint) are NOT skin colours: speech bubbles and quiz results stay paper and
ink on every skin. They live in the `:root` fallback block only.

## Primitives (`app/components/ui`, import from `~/components/ui`)

| Primitive | Use |
|---|---|
| `Button` / `ButtonLink` | `variant="c1\|c3\|plain"`, `size="md\|sm"`, `block`. `ButtonLink` wraps a router `Link`. `buttonClass()` for NavLink class callbacks |
| `IconButton` | square 44px icon-only button; `label` is required (accessible name) |
| `Panel` | `tone="plain\|c1"`, `halftone` |
| `Card` | Panel + padding + optional `kicker`/`title` |
| `Chip` | toggle chip, `pressed` sets `aria-pressed` |
| `Badge` | static pill, `tone="plain\|c1\|c2\|c3"` |
| `Input` `Textarea` `Select` `Field` | `.field` controls; `Field` adds label + hint |
| `Heading` | `kind="display\|head"`, `level={1..4}`, `ink` outline |
| `Kicker` | small label above a heading |
| `Stat` | number + label panel |
| `Section` | labelled page section with kicker + title |
| `Tabs` | WAI-ARIA tablist, arrow keys, generic over ids |

```tsx
<Section id="roster" kicker="148 characters" title="The Roster">
  <Tabs label="Side" items={[{ id: 'hero', label: 'Heroes' }, { id: 'villain', label: 'Villains' }]} active={side} onChange={setSide} />
  <ButtonLink to="/arena" variant="c1">Fight</ButtonLink>
</Section>
```

Tailwind helpers added for skin-aware markup: `rounded-skin-s/m/l/pill`, `border-skin`,
`border-{t,b,l,r}-skin`, `border-skin-s`, `shadow-skin`, `font-skin-display/head/body`,
`tilt-skin-1/2/3`, `lift-skin`, `ease-skin`, `duration-skin-fast/base/slow`, `round` (a true circle: use instead of `rounded-full`).

Character and fighter pages wear a pack through `usePackVars()` (`ui/page-theme.ts`): the whole pack under comic, accents only under a skin that owns its surfaces.

## Do / don't

- Do take every colour, font, radius, border width, shadow, easing and duration from a token or a primitive.
- Do add a new token by appending to `SKIN_VAR_NAMES` (never rename) and a comic fallback in `:root`.
- Do keep 44px targets and AA contrast; calm skins keep every animation >= 0.4 s.
- Don't write raw hex, `font-family`, `cubic-bezier(` or `border-radius: Npx` in components or CSS.
  `test/token-police.test.ts` fails if any file's count rises above `test/token-police.baseline.json`.
  After removing violations lower the baseline: `UPDATE_BASELINE=1 pnpm vitest run test/token-police.test.ts`.
- Don't branch on the skin id in a component. If a skin needs something different, add a token.
- Don't override with `html[data-realm=...] .btn {...}`: set the token in the skin instead.
- Canvas drawing cannot read CSS variables: read them once (`getComputedStyle`) or use `useSkin()`.
  A line that truly needs a raw value carries a `token-ok: reason` comment.
