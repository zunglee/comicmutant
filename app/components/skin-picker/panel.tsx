/**
 * The picker's content: one card per skin with a live preview drawn from that skin's own spec, plus
 * "Automatic (by section)". Pure of positioning/focus (skin-picker.tsx owns those) so it can be
 * rendered on the server and unit-tested with a mocked useSkin().
 */
import { useSkin } from '~/skins/context';
import { SKINS } from '~/skins/registry';
import { SKIN_IDS, type SkinId, type SkinSpec } from '~/skins/types';
import { IconCheck } from '../icons';

export type Point = { x: number; y: number };

const shadowOf = (s: SkinSpec) =>
  `${s.shape.shadowX} ${s.shape.shadowY} ${s.shape.shadowBlur} ${s.shape.shadowSpread ?? '0'} ${s.shape.shadowColor}`;

/** A miniature of the skin, painted from its spec (not from the live page tokens). */
export function SkinPreview({ spec }: { spec: SkinSpec }) {
  const { colors: c, type: t, shape: s, motion: mo } = spec;
  return (
    <span
      aria-hidden
      data-preview={spec.id}
      className="skin-picker-preview"
      style={{
        background: c.bg,
        color: c.fg,
        border: `${s.borderW} solid ${c.line}`,
        borderRadius: s.radiusM,
      }}
    >
      <span
        data-preview-name
        style={{
          fontFamily: t.display,
          textTransform: t.displayCase,
          letterSpacing: t.displayTracking,
          fontWeight: t.displayWeight,
          lineHeight: t.displayLeading,
        }}
        className="block text-xl"
      >
        {spec.label}
      </span>
      <span className="flex items-center gap-1">
        {[c.bg, c.card, c.c1, c.c2, c.c3].map((col, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed five-slot palette
            key={i}
            data-swatch
            className="size-4 shrink-0"
            style={{ background: col, border: `1px solid ${c.line}`, borderRadius: s.radiusS }}
          />
        ))}
      </span>
      <span className="flex items-center gap-2">
        <span
          data-shape-sample
          className="h-5 w-9 shrink-0"
          style={{
            background: c.card,
            border: `${s.borderW} solid ${c.line}`,
            borderRadius: s.radiusM,
            boxShadow: shadowOf(spec),
          }}
        />
        <span className="skin-picker-track" style={{ background: c.card }}>
          <span
            className="skin-picker-dot"
            data-calm={mo.calm}
            style={
              {
                background: c.c1,
                '--sp-dur': mo.calm ? '2.4s' : mo.durSlow,
                '--sp-ease': mo.easeOut,
              } as React.CSSProperties
            }
          />
        </span>
      </span>
    </span>
  );
}

function Mosaic() {
  return (
    <span aria-hidden className="skin-picker-mosaic">
      {SKIN_IDS.map((id) => (
        <span
          key={id}
          style={{ background: SKINS[id].colors.c1, borderRadius: SKINS[id].shape.radiusS }}
        />
      ))}
    </span>
  );
}

function Card({
  id,
  active,
  onScreen,
  label,
  blurb,
  preview,
  onPick,
}: {
  id: SkinId | 'auto';
  active: boolean;
  /** This skin is what the page wears now, though it is not the visitor's pick (lock route). */
  onScreen: boolean;
  label: string;
  blurb: string;
  preview: React.ReactNode;
  onPick: (from: Point) => void;
}) {
  return (
    <li>
      {/* A real form: without JS the post sets the cookie and redirects back (routes/api/skin.ts). */}
      <form
        method="post"
        action="/api/skin"
        onSubmit={(e) => {
          e.preventDefault();
          const b = (e.nativeEvent as SubmitEvent).submitter ?? e.currentTarget;
          const r = b.getBoundingClientRect();
          onPick({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
      >
        <button
          type="submit"
          name="skin"
          value={id}
          data-skin-card={id}
          aria-pressed={active}
          className={`skin-picker-card ${active ? 'is-active' : ''}`}
        >
          {preview}
          <span className="flex min-w-0 flex-col gap-1 text-left">
            <span className="h-head text-base">{label}</span>
            <span className="text-sm">{blurb}</span>
            {active && (
              <span className="inline-flex items-center gap-1 font-semibold text-sm">
                <IconCheck className="size-4" />
                Using now
              </span>
            )}
            {onScreen && !active && (
              <span className="inline-flex items-center gap-1 font-semibold text-sm">
                On this page
              </span>
            )}
          </span>
        </button>
      </form>
    </li>
  );
}

export function SkinPickerPanel({
  onPick,
  headingId = 'skin-picker-title',
  saved = null,
}: {
  onPick: (id: SkinId | null, from: Point) => void;
  headingId?: string;
  /** Confirmation shown after a pick on a lock route (the page itself does not change). */
  saved?: string | null;
}) {
  const { id, source, pinned } = useSkin();
  const locked = source === 'lock';
  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="h-display text-2xl">
        Look &amp; feel
      </h2>
      {locked && (
        <p role="note" data-skin-lock className="skin-picker-note text-sm">
          The {id === 'sacred' ? 'Sacred' : SKINS[id].label} section always stays calm, so it keeps
          its own look.{' '}
          {pinned
            ? `Your pick, ${SKINS[pinned].label}, shows everywhere else.`
            : 'Your pick shows everywhere else.'}
        </p>
      )}
      <p role="status" data-skin-saved className={saved ? 'skin-picker-note text-sm' : 'sr-only'}>
        {saved}
      </p>
      <ul className="grid gap-2">
        <Card
          id="auto"
          active={pinned === null}
          onScreen={false}
          label="Automatic (by section)"
          blurb="Each part of the site wears its own look: Sacred calm, Desi loud, the rest comic."
          preview={<Mosaic />}
          onPick={(at) => onPick(null, at)}
        />
        {SKIN_IDS.map((sid) => (
          <Card
            key={sid}
            id={sid}
            active={pinned === sid}
            onScreen={sid === id && pinned !== sid}
            label={SKINS[sid].label}
            blurb={SKINS[sid].blurb}
            preview={<SkinPreview spec={SKINS[sid]} />}
            onPick={(at) => onPick(sid, at)}
          />
        ))}
      </ul>
      <p className="text-sm">
        Character themes tint accents on the new looks; on Superhero comic they restyle the whole
        page.
      </p>
    </div>
  );
}
