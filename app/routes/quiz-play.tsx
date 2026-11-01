/**
 * /quiz/play — a Fact Frenzy game. ?mode=daily | ?mode=universe&u=<id> | ?mode=character&c=<slug>.
 * `?claim=1` is where a guest lands after joining, to attach the game they just finished.
 * The server owns questions and answers (see QuizGame); this route only validates the target and
 * hands the client each character's palette so a question card can wear it.
 */
import { Link, redirect } from 'react-router';
import { currentUser } from '~/.server/auth';
import { allCharacters, getCharacter } from '~/.server/content';
import { getSql } from '~/.server/db';
import { ClaimPanel } from '~/components/quiz/ClaimPanel';
import { istDay, istDayLabel, playHref } from '~/components/quiz/daily';
import { loadDailyStartsLeft, loadOpenDaily } from '~/components/quiz/open-daily.server';
import QuizGame from '~/components/quiz/QuizGame';
import { useNoDock } from '~/components/quiz/useNoDock';
import { QUIZ_MODES, type QuizMode } from '~/lib/quiz-contract';
import { PUBLISHED_UNIVERSES, type PublishedUniverse, UNIVERSE_LABEL } from '~/lib/taxonomy';
import type { Route } from './+types/quiz-play';

export const meta: Route.MetaFunction = () => [
  { title: 'Fact Frenzy: play — ComicMutant' },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const claim = url.searchParams.get('claim') === '1';
  const rawMode = url.searchParams.get('mode');
  const user = await currentUser(await getSql(), request);
  const who = { signedIn: !!user, me: user?.name ?? null, claim };
  if (!rawMode && claim) return { ...who, openDaily: null, startsLeft: null, game: null };

  const mode = (QUIZ_MODES as readonly string[]).includes(rawMode ?? '')
    ? (rawMode as QuizMode)
    : null;
  if (!mode) throw redirect('/quiz');

  let universe: PublishedUniverse | undefined;
  let character: string | undefined;
  let label = `Daily · ${istDayLabel()}`;
  let heading = 'Daily Challenge';
  let tint: [string, string, string] | undefined;
  if (mode === 'universe') {
    const u = url.searchParams.get('u') ?? '';
    if (!(PUBLISHED_UNIVERSES as readonly string[]).includes(u)) throw redirect('/quiz');
    universe = u as PublishedUniverse;
    label = `${UNIVERSE_LABEL[universe]} quiz`;
    heading = UNIVERSE_LABEL[universe];
  } else if (mode === 'character') {
    const c = getCharacter(url.searchParams.get('c') ?? '');
    if (!c || !(PUBLISHED_UNIVERSES as readonly string[]).includes(c.universe)) {
      throw redirect('/quiz');
    }
    character = c.slug;
    label = `${c.name} quiz`;
    heading = c.name;
    tint = [c.theme.palette.c1, c.theme.palette.c2, c.theme.palette.c3];
  }
  // Every published character's colours, so each question card can wear its own character's theme.
  const palettes: Record<string, [string, string, string]> = {};
  for (const c of allCharacters()) {
    palettes[c.slug] = [c.theme.palette.c1, c.theme.palette.c2, c.theme.palette.c3];
  }
  const openDaily = mode === 'daily' ? await loadOpenDaily(request) : null;
  const startsLeft = mode === 'daily' && !openDaily ? await loadDailyStartsLeft(request) : null;
  return {
    ...who,
    openDaily,
    startsLeft,
    game: { mode, universe, character, label, heading, tint, palettes, day: istDay() },
  };
}

export default function QuizPlay({ loaderData: d }: Route.ComponentProps) {
  useNoDock();
  const g = d.game;
  return (
    <>
      <h1 className="sr-only">Fact Frenzy{g ? `: ${g.label}` : ''}</h1>
      <ClaimPanel signedIn={d.signedIn} />
      {g ? (
        <QuizGame
          key={`${g.mode}-${g.universe}-${g.character}`}
          mode={g.mode}
          universe={g.universe}
          character={g.character}
          label={g.label}
          heading={g.heading}
          signedIn={d.signedIn}
          me={d.me}
          palettes={g.palettes}
          tint={g.tint}
          openDaily={d.openDaily}
          startsLeft={d.startsLeft}
        />
      ) : (
        <div className="mx-auto max-w-3xl px-4 py-8 text-center">
          <p className="mb-4 text-lg">Ready for another round?</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to={playHref({ mode: 'daily' })} className="btn btn-c3">
              Today's Daily Challenge
            </Link>
            <Link to="/quiz" className="btn">
              Pick a universe
            </Link>
            <Link to="/quiz/leaders" className="btn">
              Leaderboards
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
