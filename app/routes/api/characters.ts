import { allCharacters } from '~/.server/content';
import { UNIVERSE_LABEL } from '~/lib/taxonomy';
import type { Route } from './+types/characters';

/** Typeahead for pickers: up to 12 matches by name, real name or slug. */
export function loader({ request }: Route.LoaderArgs) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 40);
  const hits = q
    ? allCharacters()
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.slug.includes(q) ||
            c.realName?.toLowerCase().includes(q),
        )
        .slice(0, 12)
        .map((c) => ({ slug: c.slug, name: c.name, u: UNIVERSE_LABEL[c.universe] }))
    : [];
  return Response.json({ hits }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
