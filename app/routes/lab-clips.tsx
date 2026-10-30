/**
 * Clip lab: renders every clip kind as a filmstrip of fixed frames, for the quality gate's
 * screenshots (scripts/clip-shots.ts). Dev only, or with COMICMUTANT_LAB=1.
 */
import { useEffect, useRef } from 'react';
import { data } from 'react-router';
import { getCharacter, getFighter } from '~/.server/content';
import { spriteClip } from '~/game/sprite/rig';
import type { DrawFn } from '~/lib/clips/ClipCanvas';
import { SPRITE_POSES } from '~/lib/clips/gate';
import { CLIP_KINDS } from '~/lib/clips/registry';
import type { Route } from './+types/lab-clips';

export const meta = () => [{ name: 'robots', content: 'noindex' }];

export function loader({ request }: Route.LoaderArgs) {
  if (process.env.NODE_ENV === 'production' && process.env.COMICMUTANT_LAB !== '1')
    throw data('Not found', { status: 404 });
  const url = new URL(request.url);
  const slug = url.searchParams.get('t') ?? 'spider-man';
  const only = url.searchParams.get('kind');
  const c = getCharacter(slug);
  const f = c ? undefined : getFighter(slug);
  if (!c && !f) throw data('unknown theme', { status: 404 });
  // Sample times are a parameter so a gate round can't be tuned to fixed frames.
  const frames = (url.searchParams.get('frames') ?? '0.15,0.6,1.2,2.1')
    .split(',')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 30)
    .slice(0, 6);
  const kinds = (url.searchParams.get('kinds') ?? '').split(',').filter(Boolean);
  return { c, f, only, frames, kinds };
}

function Still({ draw, t }: { draw: DrawFn; t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    cv.width = 220;
    cv.height = 220;
    // Wait for the display font so text-based clips are judged as shipped.
    document.fonts.ready.then(() => {
      ctx.clearRect(0, 0, 220, 220);
      draw(ctx, t, 220, 220);
      cv.dataset.ready = '1';
    });
  }, [draw, t]);
  return <canvas ref={ref} width={220} height={220} className="border-2 border-black" />;
}

export default function Lab({ loaderData: d }: Route.ComponentProps) {
  const rows: { id: string; label: string; draw: DrawFn }[] = d.c
    ? CLIP_KINDS.filter(
        (k) => (!d.only || k.id === d.only) && (!d.kinds.length || d.kinds.includes(k.id)),
      ).map((k) => ({
        id: k.id,
        label: k.label,
        // biome-ignore lint/style/noNonNullAssertion: guarded by d.c.
        draw: k.make({
          ...d.c!.theme.palette,
          motif: d.c!.theme.motif,
          name: d.c!.name,
          year: d.c!.firstAppearance.year,
        }),
      }))
    : SPRITE_POSES.filter((p) => !d.only || p === d.only).map((p) => ({
        id: p,
        label: p,
        // biome-ignore lint/style/noNonNullAssertion: guarded by loader.
        draw: spriteClip(d.f!, p as Parameters<typeof spriteClip>[1]),
      }));
  return (
    <div className="space-y-4 bg-white p-4 text-black">
      {rows.map((r) => (
        <section key={r.id} data-kind={r.id} className="flex items-center gap-2">
          <p className="w-32 font-head text-xs">{r.label}</p>
          {d.frames.map((t) => (
            <Still key={t} draw={r.draw} t={t} />
          ))}
        </section>
      ))}
    </div>
  );
}
