import { m } from 'motion/react';
import { Link } from 'react-router';
import { KindTag, MotifClip } from '~/components/bits';
import type { ClipParams } from '~/lib/clips/registry';
import { scopeVars } from '~/lib/theme/compute';
import { useSkinMotion } from '~/skins/motion';
import { artKind, type DesiCardData } from './logic';

/** Roster-style card with the knowledge line (publisher, year, fact count) a wiki needs. */
export function DesiCard({ c, index }: { c: DesiCardData; index: number }) {
  const mo = useSkinMotion();
  return (
    <m.li
      // The skin's entrance (spec.motion.entrance), spring and stagger.
      initial={mo.entrance.initial}
      animate={mo.entrance.animate}
      transition={mo.spring(undefined, mo.delay(index % 8, 0.03))}
      className="list-none"
    >
      <Link
        to={`/c/${c.slug}`}
        style={scopeVars(c.palette) as React.CSSProperties}
        className="group panel relative block overflow-hidden transition-transform duration-skin-base hover:-translate-y-1 hover:-rotate-1 hover:shadow-ink-lg focus-visible:-translate-y-1"
      >
        <div
          className="relative aspect-[4/3] overflow-hidden border-line border-b-[3px]"
          style={{ background: c.palette.c2 }}
        >
          <MotifClip
            params={{
              ...c.palette,
              motif: c.motif as ClipParams['motif'],
              name: c.name,
              year: c.year,
            }}
            kind={artKind(c.motif, c.slug)}
            aspect={4 / 3}
            className="h-full w-full"
            decorative
            hoverPlay
          />
        </div>
        <div className="space-y-1 p-3">
          <KindTag kind={c.kind} />
          <p className="h-display text-2xl" style={{ color: 'var(--card-fg)' }}>
            {c.name}
          </p>
          <p className="text-muted text-xs">
            {c.group} · {c.year}
            {c.factCount > 0 && ` · ${c.factCount} facts`}
          </p>
          <p className="line-clamp-2 text-muted text-sm">{c.summary}</p>
        </div>
      </Link>
    </m.li>
  );
}
