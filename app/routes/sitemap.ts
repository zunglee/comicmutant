import { allCharacters, allFighters } from '~/.server/content';
import { allFigures } from '~/.server/sacred';
import { TRADITION_TABLE } from '~/lib/sacred-taxonomy';

export function loader({ request }: { request: Request }) {
  const o = new URL(request.url).origin;
  const urls = [
    '/',
    '/roster',
    '/originals',
    '/arena',
    '/freefall',
    '/quiz',
    '/quiz/leaders',
    '/versus',
    '/rumours',
    '/themes',
    '/about',
    '/desi',
    '/sacred',
    '/sacred/learn',
    ...TRADITION_TABLE.map((t) => `/sacred/${t.id}`),
    ...allFigures.map((f) => `/sacred/f/${f.slug}`),
    ...allCharacters().map((c) => `/c/${c.slug}`),
    ...allFighters().map((f) => `/originals/${f.slug}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${o}${u}</loc></url>`)
    .join('')}</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
