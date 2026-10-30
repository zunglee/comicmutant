import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),

  route('roster', 'routes/roster.tsx'),
  route('c/:slug', 'routes/character.tsx'),
  route('originals', 'routes/originals.tsx'),
  route('originals/:slug', 'routes/fighter.tsx'),
  route('themes', 'routes/themes.tsx'),
  route('rumours', 'routes/rumours.tsx'),
  route('timeline', 'routes/timeline.tsx'),
  route('gadgets', 'routes/gadgets.tsx'),
  route('gadgets/:slug', 'routes/gadget.tsx'),
  route('versus', 'routes/versus.tsx'),
  route('versus/:id', 'routes/versus-room.tsx'),
  route('about', 'routes/about.tsx'),
  route('lab/clips', 'routes/lab-clips.tsx'),

  // Games (canvas). Each game is its own lazy chunk inside arena-play.
  route('arena', 'routes/arena.tsx'),
  route('arena/:game', 'routes/arena-play.tsx'),

  // Accounts + moderation.
  route('join', 'routes/join.tsx'),
  route('login', 'routes/login.tsx'),
  route('logout', 'routes/logout.ts'),
  route('mod', 'routes/mod.tsx'),

  // Resource routes.
  route('themes/index.json', 'routes/theme-index.ts'),
  route('themes/pack/:slug', 'routes/theme-pack.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  ...prefix('api', [
    route('take', 'routes/api/take.ts'),
    route('react', 'routes/api/react.ts'),
    route('vote', 'routes/api/vote.ts'),
    route('report', 'routes/api/report.ts'),
    route('score', 'routes/api/score.ts'),
    route('takes', 'routes/api/takes.ts'),
    route('characters', 'routes/api/characters.ts'),
  ]),

  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
