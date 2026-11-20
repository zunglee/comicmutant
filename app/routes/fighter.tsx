import { m } from 'motion/react';
import { useState } from 'react';
import { data, Link } from 'react-router';
import { allFighters, getFighter } from '~/.server/content';
import { packFor } from '~/.server/themes';
import { Atmosphere, useAtmosphere } from '~/components/atmosphere';
import { KindTag } from '~/components/bits';
import { IconPad, IconPin } from '~/components/icons';
import { SpriteClip } from '~/components/sprite';
import { usePackVars } from '~/components/ui/page-theme';
import type { SpriteClipProps } from '~/game/SpriteClip';
import { SPRITE_POSES } from '~/lib/clips/gate';
import { useTheme } from '~/lib/theme/context';
import type { Route } from './+types/fighter';

export function loader({ params }: Route.LoaderArgs) {
  const f = getFighter(params.slug);
  if (!f) throw data('No such original.', { status: 404 });
  const rivals = f.rivals.map((s) => getFighter(s)).filter((x) => x !== undefined);
  // biome-ignore lint/style/noNonNullAssertion: every fighter resolves to a pack.
  return { f, pack: packFor(f.slug)!, rivals, count: allFighters().length };
}

export const meta: Route.MetaFunction = ({ loaderData: d }) =>
  d
    ? [
        { title: `${d.f.alias} (${d.f.name}) — CM Originals` },
        { name: 'description', content: d.f.bio },
      ]
    : [];

const STATS = ['power', 'speed', 'defense', 'special'] as const;

export default function FighterPage({ loaderData: d }: Route.ComponentProps) {
  const { f, pack } = d;
  const pv = usePackVars(pack.vars);
  const { equip, pin, top5 } = useTheme();
  const [all, setAll] = useState(false);
  // Pose ids + labels without importing the rig (it loads lazily with the first clip).
  const poses = SPRITE_POSES.filter((id) => pack.clips.includes(id)).map((id) => ({
    id: id as SpriteClipProps['pose'],
    label: id.replace('-', ' ').replace(/^./, (c) => c.toUpperCase()),
  }));
  const rival = d.rivals[0];
  const weather = {
    motif: f.theme.motif,
    c1: f.theme.palette.c1,
    c3: f.theme.palette.c3,
    dark: pv.dark ?? pack.mood === 'dark',
  };
  useAtmosphere(weather);
  return (
    <div
      style={{ ...pv.style, background: 'var(--bg)', color: 'var(--fg)' }}
      className="relative isolate"
    >
      <Atmosphere weather={weather} />
      <section className="relative z-[1] mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-16 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <div className="flex gap-2">
            <span className="chip pointer-events-none">CM Original</span>
            <KindTag kind={f.kind} />
            <span className="chip pointer-events-none">{f.archetype}</span>
          </div>
          <h1 className="h-display ink-text text-[clamp(3rem,9vw,6.5rem)] text-c1-text">
            {f.alias}
          </h1>
          <p className="h-head text-xl">{f.name}</p>
          <p className="bubble max-w-xl text-lg">{f.bio}</p>
          <p className="h-head text-c3-text text-lg">“{f.catchphrase}”</p>
          <dl className="panel grid max-w-md gap-2 p-4">
            {STATS.map((s, i) => (
              <div key={s} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3">
                <dt className="font-head text-sm uppercase">{s}</dt>
                <dd className="h-4 overflow-hidden rounded-skin-s border-2 border-line bg-bg">
                  <m.div
                    className="h-full bg-c1"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${f.stats[s] * 10}%` }}
                    viewport={{ once: true }}
                    transition={{ type: 'spring', stiffness: 120, damping: 16, delay: i * 0.08 }}
                  />
                </dd>
                <span className="text-right font-head">{f.stats[s]}</span>
              </div>
            ))}
            <p className="pt-2 text-sm">
              <span className="kicker text-card-fg!">Special · </span>
              {f.special.name} ({f.special.kind})
            </p>
          </dl>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/arena/fight?p1=${f.slug}&p2=${rival?.slug ?? ''}&vs=cpu&d=normal`}
              className="btn btn-c1"
            >
              <IconPad /> Fight {rival ? rival.alias : 'now'}
            </Link>
            <button
              type="button"
              className="btn"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                equip(pack, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
            >
              Wear theme
            </button>
            <button
              type="button"
              className="btn"
              disabled={top5.some((p) => p.slug === f.slug)}
              onClick={() => pin(pack)}
            >
              <IconPin /> Pin
            </button>
          </div>
        </div>
        <div className="panel overflow-hidden p-0 shadow-ink-lg">
          <SpriteClip fighter={f} pose="special" />
        </div>
      </section>

      <section className="relative z-[1] mx-auto max-w-7xl px-4 pb-20" aria-labelledby="moves-h">
        <p className="kicker">{poses.length} animated clips</p>
        <h2 id="moves-h" className="h-display ink-text mb-8 text-5xl text-c1-text">
          Move list
        </h2>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {(all ? poses : poses.slice(0, 10)).map((p) => (
            <li key={p.id} className="panel overflow-hidden p-0">
              <SpriteClip fighter={f} pose={p.id} save />
              <p className="border-line border-t-[3px] px-3 py-1.5 font-head text-xs uppercase">
                {p.label}
              </p>
            </li>
          ))}
        </ul>
        {!all && poses.length > 10 && (
          <div className="mt-6 text-center">
            <button type="button" className="btn btn-c1" onClick={() => setAll(true)}>
              All {poses.length} moves
            </button>
          </div>
        )}
        {d.rivals.length > 0 && (
          <div className="mt-16">
            <h2 className="h-display ink-text mb-5 text-4xl text-c1-text">Rivals</h2>
            <ul className="flex flex-wrap gap-3">
              {d.rivals.map((r) => (
                <li key={r.slug}>
                  <Link to={`/originals/${r.slug}`} className="btn">
                    {r.alias}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
