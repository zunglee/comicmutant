import { themeIndex } from '~/.server/content';
import { HOUSE } from '~/.server/themes';

/** Machine-readable theme catalogue — what an external theme tool or a future app would list. */
export function loader() {
  return Response.json(
    { house: HOUSE.slug, themes: themeIndex() },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
