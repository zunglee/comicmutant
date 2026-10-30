import { allCharacters, allFighters } from '~/.server/content';

export function loader({ request }: { request: Request }) {
  const o = new URL(request.url).origin;
  const urls = [
    '/',
    '/roster',
    '/originals',
    '/arena',
    '/versus',
    '/rumours',
    '/themes',
    '/about',
    ...allCharacters().map((c) => `/c/${c.slug}`),
    ...allFighters().map((f) => `/originals/${f.slug}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${o}${u}</loc></url>`)
    .join('')}</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
