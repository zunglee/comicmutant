import { data } from 'react-router';
import { packFor } from '~/.server/themes';
import type { Route } from './+types/theme-pack';

/** One theme pack (~1 KB). Versioned by ?v= so it can be cached hard. */
export function loader({ params, request }: Route.LoaderArgs) {
  const pack = packFor(params.slug);
  if (!pack) throw data({ error: 'unknown theme' }, { status: 404 });
  // The URL carries the pack's own version: a matching ?v= is immutable, anything else is short.
  const v = new URL(request.url).searchParams.get('v');
  const cache = v === pack.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
  return Response.json(pack, {
    headers: { 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' },
  });
}
