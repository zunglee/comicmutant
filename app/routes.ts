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
  // Flagship daily game: math gates + verified leaderboard.
  route('freefall', 'routes/freefall.tsx'),
  // Fact Frenzy: server-scored facts quiz over the published roster.
  route('quiz', 'routes/quiz.tsx'),
  route('quiz/play', 'routes/quiz-play.tsx'),
  route('quiz/leaders', 'routes/quiz-leaders.tsx'),
  route('quiz/me', 'routes/quiz-me.tsx'),

  // Sacred India: calm realm for India's faiths (reports/sacred-design.md).
  route('sacred', 'routes/sacred.tsx'),
  route('sacred/learn', 'routes/sacred-learn.tsx'),
  route('sacred/f/:slug', 'routes/sacred-figure.tsx'),
  route('sacred/:tradition', 'routes/sacred-tradition.tsx'),
  // Desi heroes hub: the Indian superhero wiki.
  route('desi', 'routes/desi.tsx'),

  // Accounts + moderation.
  route('join', 'routes/join.tsx'),
  route('login', 'routes/login.tsx'),
  route('logout', 'routes/logout.ts'),
  route('mod', 'routes/mod.tsx'),
  route('mod/freefall/:id', 'routes/mod-freefall.tsx'),
  route('mod/quiz', 'routes/mod-quiz.tsx'),

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
    route('freefall/start', 'routes/api/freefall-start.ts'),
    route('freefall/submit', 'routes/api/freefall-submit.ts'),
    route('freefall/end', 'routes/api/freefall-end.ts'),
    route('freefall/tick', 'routes/api/freefall-tick.ts'),
    route('poll', 'routes/api/poll.ts'),
    route('fact-react', 'routes/api/fact-react.ts'),
    route('quiz/start', 'routes/api/quiz-start.ts'),
    route('quiz/answer', 'routes/api/quiz-answer.ts'),
    route('quiz/next', 'routes/api/quiz-next.ts'),
    route('quiz/claim', 'routes/api/quiz-claim.ts'),
    route('quiz/report', 'routes/api/quiz-report.ts'),
    route('takes', 'routes/api/takes.ts'),
    route('characters', 'routes/api/characters.ts'),
    route('skin', 'routes/api/skin.ts'),
  ]),

  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
