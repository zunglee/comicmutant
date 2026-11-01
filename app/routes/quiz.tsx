/**
 * /quiz — the Fact Frenzy hub: animated title, today's Daily Challenge, five universe cards and a
 * searchable picker for the 108 characters. Play is /quiz/play; boards are /quiz/leaders and
 * /quiz/me. Real character names appear as text only (Hybrid IP rule).
 */
import { Link } from 'react-router';
import { currentUser } from '~/.server/auth';
import { allCharacters } from '~/.server/content';
import { getSql } from '~/.server/db';
import { dailyArchive } from '~/.server/quiz';
import { ClaimPanel } from '~/components/quiz/ClaimPanel';
import { istDayLabel } from '~/components/quiz/daily';
import {
  CharacterPicker,
  DailyCard,
  HowItWorks,
  HubTitle,
  type RosterRow,
  UniverseCards,
  YesterdayAnswers,
} from '~/components/quiz/Hub';
import { loadDailyStartsLeft, loadOpenDaily } from '~/components/quiz/open-daily.server';
import { useNoDock } from '~/components/quiz/useNoDock';
import type { DailyArchive } from '~/lib/quiz-contract';
import { PUBLISHED_UNIVERSES, type PublishedUniverse } from '~/lib/taxonomy';
import type { Route } from './+types/quiz';

export const meta: Route.MetaFunction = () => [
  { title: 'Fact Frenzy: the comic characters facts quiz — ComicMutant' },
  {
    name: 'description',
    content:
      'A fast facts quiz on 108 comic, anime and Desi characters: a new Daily Challenge every midnight IST, quizzes per universe and per character, streaks, boards and sources for every fact.',
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const preview = import.meta.env.DEV && new URL(request.url).searchParams.get('fixture') === '1';
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const published = new Set<string>(PUBLISHED_UNIVERSES);
  const roster: RosterRow[] = allCharacters()
    .filter((c) => published.has(c.universe))
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      universe: c.universe as PublishedUniverse,
      palette: [c.theme.palette.c1, c.theme.palette.c2, c.theme.palette.c3] as [
        string,
        string,
        string,
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const counts = Object.fromEntries(PUBLISHED_UNIVERSES.map((u) => [u, 0])) as Record<
    PublishedUniverse,
    number
  >;
  for (const r of roster) counts[r.universe]++;
  // Yesterday's daily with its answers unlocked (Q10); the section hides itself when there is none.
  const archive: DailyArchive | null = preview
    ? (await import('~/components/quiz/fixture')).fixtureArchive()
    : await dailyArchive(sql, Date.now());
  const palettes = Object.fromEntries(roster.map((r) => [r.slug, r.palette]));
  const popular = [...allCharacters()]
    .filter((c) => published.has(c.universe))
    .sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((c) => c.slug);
  const openDaily = preview ? null : await loadOpenDaily(request);
  const startsLeft = preview || openDaily ? null : await loadDailyStartsLeft(request);
  return {
    openDaily,
    startsLeft,
    roster,
    popular,
    counts,
    dayLabel: istDayLabel(),
    signedIn: !!user,
    archive,
    palettes,
  };
}

export default function Quiz({ loaderData: d }: Route.ComponentProps) {
  useNoDock();
  return (
    <>
      <ClaimPanel signedIn={d.signedIn} />
      <div className="mx-auto max-w-5xl overflow-x-clip px-4 py-6 sm:py-10">
        <HubTitle />
        <DailyCard
          dayLabel={d.dayLabel}
          open={d.openDaily}
          signedIn={d.signedIn}
          startsLeft={d.startsLeft}
        />
        <UniverseCards counts={d.counts} />
        <nav aria-label="Boards" className="mb-4 flex flex-wrap justify-center gap-3">
          <Link to="/quiz/leaders" className="btn btn-c3">
            Leaderboards
          </Link>
          <Link to="/quiz/me" className="btn">
            My stats
          </Link>
        </nav>
        <CharacterPicker roster={d.roster} popular={d.popular} />
        {d.archive && d.archive.questions.length > 0 && (
          <YesterdayAnswers archive={d.archive} palettes={d.palettes} />
        )}
        <HowItWorks />
      </div>
    </>
  );
}
