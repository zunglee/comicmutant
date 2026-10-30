export function loader({ request }: { request: Request }) {
  const origin = new URL(request.url).origin;
  return new Response(
    `User-agent: *\nDisallow: /mod\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
    {
      headers: { 'Content-Type': 'text/plain' },
    },
  );
}
