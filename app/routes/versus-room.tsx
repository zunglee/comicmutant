import { m } from 'motion/react';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { data, Link, useFetcher } from 'react-router';
import { currentUser } from '~/.server/auth';
import { getVersus, listTakes, myVote } from '~/.server/community';
import { getCharacter, toCard } from '~/.server/content';
import { getSql } from '~/.server/db';
import { guestId } from '~/.server/voter';
import { MotifClip } from '~/components/bits';
import { TakeComposer, TakeList } from '~/components/takes';
import { VERSUS_PROMPTS } from '~/lib/community';
import { scopeVars } from '~/lib/theme/compute';
import type { Route } from './+types/versus-room';

export async function loader({ params, request }: Route.LoaderArgs) {
  const sql = await getSql();
  const v = await getVersus(sql, Number(params.id));
  const a = v && getCharacter(v.a);
  const b = v && getCharacter(v.b);
  if (!v || !a || !b) throw data('This debate left the building.', { status: 404 });
  const user = await currentUser(sql, request);
  const g = guestId(request);
  const voter = user ? `u:${user.id}` : g ? `g:${g}` : null;
  const target = `v:${v.id}`;
  const viewer = user?.id ?? null;
  return {
    id: v.id,
    prompt: VERSUS_PROMPTS[v.prompt],
    votes: { a: v.votes_a, b: v.votes_b },
    mine: voter ? await myVote(sql, v.id, voter) : null,
    a: { ...toCard(a), tagline: a.theme.tagline },
    b: { ...toCard(b), tagline: b.theme.tagline },
    // Each side pages on its own, so one loud side can't push the other off the page.
    takesA: await listTakes(sql, target, viewer, { side: 'a' }),
    takesB: await listTakes(sql, target, viewer, { side: 'b' }),
    signedIn: !!user,
  };
}

export function shouldRevalidate({
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formAction === '/api/react' || formAction === '/api/report') return false;
  return defaultShouldRevalidate;
}

export const meta: Route.MetaFunction = ({ loaderData: d }) =>
  d
    ? [{ title: `${d.a.name} vs ${d.b.name}: ${d.prompt} — ComicMutant` }]
    : [{ title: 'Versus — ComicMutant' }];

export default function Room({ loaderData: d }: Route.ComponentProps) {
  const f = useFetcher();
  const pending = f.formData?.get('side')?.toString() as 'a' | 'b' | undefined;
  const mine = pending ?? d.mine;
  // Optimistic tally: move the meter the moment a side is tapped.
  const va =
    d.votes.a + (mine === 'a' && d.mine !== 'a' ? 1 : 0) - (d.mine === 'a' && mine === 'b' ? 1 : 0);
  const vb =
    d.votes.b + (mine === 'b' && d.mine !== 'b' ? 1 : 0) - (d.mine === 'b' && mine === 'a' ? 1 : 0);
  const total = va + vb;
  const pa = total ? va / total : 0.5;
  const sides = [
    ['a', d.a],
    ['b', d.b],
  ] as const;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Link to="/versus" className="kicker inline-flex min-h-11 items-center hover:underline">
        ← All debates
      </Link>
      <h1 className="h-display ink-text mt-2 mb-8 text-center text-[clamp(2.4rem,7vw,5rem)] text-fg">
        {d.prompt}
      </h1>

      <div className="relative grid gap-4 md:grid-cols-2">
        {sides.map(([key, c], k) => (
          <m.section
            key={key}
            initial={{ x: k ? 80 : -80, rotate: k ? 4 : -4 }}
            animate={{ x: 0, rotate: k ? 1 : -1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 16 }}
            style={scopeVars(c.palette) as React.CSSProperties}
            className="panel overflow-hidden"
            aria-labelledby={`side-${key}`}
          >
            <MotifClip
              params={{ ...c.palette, motif: c.motif, name: c.name }}
              kind={k ? 'impact' : 'blast'}
              aspect={2}
            />
            <div className="space-y-3 p-5">
              <h2 id={`side-${key}`} className="h-display text-4xl">
                <Link to={`/c/${c.slug}`} className="hover:underline">
                  {c.name}
                </Link>
              </h2>
              <p className="text-muted text-sm">{c.tagline}</p>
              <f.Form method="post" action="/api/vote">
                <input type="hidden" name="versus" value={d.id} />
                <button
                  type="submit"
                  name="side"
                  value={key}
                  aria-pressed={mine === key}
                  className={`btn w-full ${mine === key ? 'btn-c1' : ''}`}
                >
                  {mine === key ? `Team ${c.name} ✓` : `I'm Team ${c.name}`}
                </button>
              </f.Form>
            </div>
          </m.section>
        ))}
        <span className="burst pointer-events-none absolute top-24 left-1/2 hidden size-24 -translate-x-1/2 place-items-center bg-c3 font-display text-4xl text-on-c3 md:grid">
          VS
        </span>
      </div>

      {/* Tug of war */}
      <div className="panel my-10 p-4">
        <div
          className="relative h-12 overflow-hidden rounded-md border-[3px] border-line"
          role="img"
          aria-label={`${Math.round(pa * 100)}% ${d.a.name}, ${Math.round((1 - pa) * 100)}% ${d.b.name}`}
        >
          <div className="absolute inset-0" style={{ background: d.b.palette.c1 }} />
          <m.div
            className="absolute inset-y-0 left-0"
            style={{ background: d.a.palette.c1 }}
            animate={{ width: `${pa * 100}%` }}
            transition={{ type: 'spring', stiffness: 140, damping: 12 }}
          />
          <m.div
            className="absolute top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-line bg-white"
            animate={{ left: `${pa * 100}%` }}
            transition={{ type: 'spring', stiffness: 140, damping: 12 }}
          />
        </div>
        <p className="mt-2 flex justify-between font-head" aria-live="polite">
          <span>
            {d.a.name} {Math.round(pa * 100)}%
          </span>
          <span>{total} votes</span>
          <span>
            {Math.round((1 - pa) * 100)}% {d.b.name}
          </span>
        </p>
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        {sides.map(([key, c]) => (
          <section key={key} aria-label={`Takes for ${c.name}`} className="space-y-5">
            <h2 className="h-display text-3xl" style={{ color: 'var(--fg)' }}>
              Team {c.name} says
            </h2>
            <TakeComposer
              target={`v:${d.id}`}
              side={key}
              signedIn={d.signedIn}
              placeholder={`Why ${c.name}?`}
            />
            <TakeList
              takes={key === 'a' ? d.takesA : d.takesB}
              signedIn={d.signedIn}
              tint={() => c.palette.c1}
              target={`v:${d.id}`}
              side={key}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
