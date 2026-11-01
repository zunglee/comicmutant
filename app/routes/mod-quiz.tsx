/**
 * /mod/quiz — Fact Frenzy for moderators, in four tabs (URL param) so no page runs long: trust checks,
 * held games, reported facts and site analytics. Queues page 10 at a time. Forms follow /mod:
 * same-origin, answered with the core's own words (rulings) or a redirect with a status message.
 */
import { Link, redirect } from 'react-router';
import { requireMod } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { assertSameOrigin, readForm } from '~/.server/guard';
import {
  MAX_GAME_SCORE,
  modQuizQueues,
  rejectFan,
  retireQuestion,
  ruleGame,
  siteStats,
  trustQueue,
} from '~/.server/quiz';
import { SectionHead } from '~/components/bits';
import { useNoDock } from '~/components/quiz/useNoDock';
import { BarList } from '~/components/quiz-data/bar-list';
import { DayChart } from '~/components/quiz-data/day-chart';
import { MODE_LABEL, nf, pct, universeName } from '~/components/quiz-data/format';
import { HeldItem, Pager, ReportItem, TrustItem } from '~/components/quiz-data/mod-items';
import { groupTrust } from '~/components/quiz-data/trust-group';
import type { Route } from './+types/mod-quiz';

export const meta: Route.MetaFunction = () => [
  { title: 'Fact Frenzy moderation — ComicMutant' },
  { name: 'robots', content: 'noindex' },
];

const DONE = {
  retired: 'Question retired. It will not be served again.',
  restored: 'Question restored. It can be served again.',
} as const;
type Done = keyof typeof DONE;

const TABS = ['trust', 'held', 'reports', 'analytics'] as const;
type Tab = (typeof TABS)[number];
const PER_PAGE = 10;

export async function loader({ request }: Route.LoaderArgs) {
  const sql = await getSql();
  await requireMod(sql, request);
  const url = new URL(request.url);
  const done = url.searchParams.get('done');
  const [queues, queue] = await Promise.all([modQuizQueues(sql), trustQueue(sql)]);
  // The core lists a game once per board; a mod rules on the game, so one card per game.
  const trust = groupTrust(queue);
  const counts = { trust: trust.length, held: queues.held.length, reports: queues.reports.length };
  // No tab in the URL: open the first queue that has something waiting.
  const asked = url.searchParams.get('tab');
  const tab: Tab = TABS.includes(asked as Tab)
    ? (asked as Tab)
    : counts.trust > 0
      ? 'trust'
      : counts.held > 0
        ? 'held'
        : counts.reports > 0
          ? 'reports'
          : 'trust';
  const total = tab === 'analytics' ? 0 : counts[tab];
  const lastPage = Math.max(0, Math.ceil(total / PER_PAGE) - 1);
  const page = Math.min(lastPage, Math.max(0, Number(url.searchParams.get('p')) || 0));
  const from = page * PER_PAGE;
  return {
    tab,
    page,
    per: PER_PAGE,
    maxScore: MAX_GAME_SCORE,
    counts,
    trust: tab === 'trust' ? trust.slice(from, from + PER_PAGE) : [],
    held: tab === 'held' ? queues.held.slice(from, from + PER_PAGE) : [],
    reports: tab === 'reports' ? queues.reports.slice(from, from + PER_PAGE) : [],
    stats: tab === 'analytics' ? await siteStats(sql, Date.now()) : null,
    done: done && done in DONE ? (done as Done) : null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const sql = await getSql();
  await requireMod(sql, request);
  const form = await readForm(request);
  const call = form.get('call');
  const gameId = () => {
    const n = Number(form.get('game'));
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  // A ruling answers in the core's own words (what cap it set or reset), shown as this action's status.
  if (
    call === 'approve' ||
    call === 'reject' ||
    call === 'trust-approve' ||
    call === 'trust-reject'
  ) {
    const game = gameId();
    if (game === null) return { ok: false as const, error: 'That game id is not valid.' };
    const approving = call === 'approve' || call === 'trust-approve';
    // The board names which cap an approval sets (a facts item sets the facts cap).
    const board = String(form.get('board') ?? '').slice(0, 80) || undefined;
    const ruling = await ruleGame(sql, game, approving, undefined, board);
    // Either way the core says what happened (a refusal says why: not found, not finished, already).
    return ruling.ok
      ? { ok: true as const, message: ruling.message }
      : { ok: false as const, error: ruling.message };
  }
  if (call === 'reject-fan-game') {
    // A held card knows the game, not the fan: look the fan up from the game.
    const game = gameId();
    const row =
      game === null
        ? undefined
        : await sql.get<{ user_id: number | null }>('SELECT user_id FROM quiz_games WHERE id = ?', [
            game,
          ]);
    if (!row?.user_id)
      return {
        ok: false as const,
        error: `Game #${game ?? '?'} was not found, or has no fan to reject.`,
      };
    const r = await rejectFan(sql, row.user_id);
    return { ok: true as const, message: r.message };
  }
  if (call === 'reject-fan') {
    const raw = form.get('fan');
    const fan = Number(raw);
    if (!raw || !Number.isSafeInteger(fan) || fan <= 0)
      return { ok: false as const, error: 'That fan id is not valid.' };
    const r = await rejectFan(sql, fan);
    return { ok: true as const, message: r.message };
  }
  if (call === 'retire' || call === 'restore') {
    const id = form.get('question') ?? '';
    if (!id || id.length > 120)
      return { ok: false as const, error: 'That question id is not valid.' };
    if (!(await retireQuestion(sql, id, call === 'retire')))
      return { ok: false as const, error: 'That question is not in the bank.' };
    throw redirect(`/mod/quiz?tab=reports&done=${call === 'retire' ? 'retired' : 'restored'}`);
  }
  return { ok: false as const, error: 'Unknown action.' };
}

export default function ModQuiz({ loaderData: d, actionData }: Route.ComponentProps) {
  // The floating theme dock would sit over the queue's buttons.
  useNoDock();
  const tabs: [Tab, string][] = [
    ['trust', `Trust checks (${d.counts.trust})`],
    ['held', `Held games (${d.counts.held})`],
    ['reports', `Reported facts (${d.counts.reports})`],
    ['analytics', 'Analytics'],
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-28">
      <SectionHead level={1} kicker="Mods only" title="Fact Frenzy" />

      {d.done && (
        <p role="status" className="bubble mb-6">
          {DONE[d.done]}
        </p>
      )}
      {actionData?.ok && (
        <p role="status" className="bubble mb-6">
          {actionData.message}
        </p>
      )}
      {actionData && !actionData.ok && (
        <p role="alert" className="bubble mb-6">
          {actionData.error}
        </p>
      )}

      <nav aria-label="Moderation sections" className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Link
            key={id}
            to={`?tab=${id}`}
            className="chip min-h-11"
            aria-current={id === d.tab ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {d.tab === 'trust' && (
        <section aria-labelledby="trust">
          <h2 id="trust" className="h-head mb-1 text-2xl">
            Trust checks
          </h2>
          <p className="mb-3 text-muted text-sm">
            {d.counts.trust} {d.counts.trust === 1 ? 'game' : 'games'} waiting, each with the boards
            it is waiting on. A fan's name shows in a top place only while a moderator has approved
            a game for it. On the daily podium that is per game. On a universe board names show up
            to 1.1 times the last approved score, and on the facts board up to the facts count at
            approval plus 30; anything above comes back here. Rejecting a game resets those caps.
            Tight timing counts as a scouting signal, not a block.
          </p>
          {d.counts.trust === 0 ? (
            <p className="bubble">No trust checks waiting.</p>
          ) : (
            <ul className="space-y-4">
              {d.trust.map((t) => (
                <TrustItem key={t.gameId} t={t} maxScore={d.maxScore} />
              ))}
            </ul>
          )}
          <Pager tab="trust" page={d.page} per={d.per} total={d.counts.trust} />
        </section>
      )}

      {d.tab === 'held' && (
        <section aria-labelledby="held">
          <h2 id="held" className="h-head mb-1 text-2xl">
            Ranked games held for a pace check
          </h2>
          <p className="mb-3 text-muted text-sm">
            {d.counts.held} waiting. Only ranked games are held (practice and guest games never
            are). Approve names that game on its own board, credits its facts and sets no cap;
            reject keeps it off every board.
          </p>
          {d.counts.held === 0 ? (
            <p className="bubble">No ranked games waiting for a check.</p>
          ) : (
            <ul className="space-y-4">
              {d.held.map((g) => (
                <HeldItem key={g.id} g={g} />
              ))}
            </ul>
          )}
          <Pager tab="held" page={d.page} per={d.per} total={d.counts.held} />
        </section>
      )}

      {d.tab === 'reports' && (
        <section aria-labelledby="reports">
          <h2 id="reports" className="h-head mb-1 text-2xl">
            Reported facts
          </h2>
          <p className="mb-3 text-muted text-sm">
            {d.counts.reports} reported · most reports first. Check the source, then retire the
            question (it is never served again) or leave it.
          </p>
          {d.counts.reports === 0 ? (
            <p className="bubble">No reports. The facts are holding up.</p>
          ) : (
            <ul className="space-y-4">
              {d.reports.map((r) => (
                <ReportItem key={r.questionId} r={r} />
              ))}
            </ul>
          )}
          <Pager tab="reports" page={d.page} per={d.per} total={d.counts.reports} />
        </section>
      )}

      {d.tab === 'analytics' && d.stats && <Analytics s={d.stats} />}
    </div>
  );
}

function Analytics({ s }: { s: NonNullable<Route.ComponentProps['loaderData']['stats']> }) {
  const totals: [string, number][] = [
    ['Games', s.totals.games],
    ['Players', s.totals.players],
    ['Questions answered', s.totals.answers],
    ['Live questions', s.totals.bank],
    ['Retired', s.totals.retired],
    ...(s.totals.blindDailies === undefined
      ? []
      : ([['Blind dailies (not ranked)', s.totals.blindDailies]] as [string, number][])),
  ];
  const maxMode = Math.max(1, ...s.byMode.map((x) => x.games));
  const maxUni = Math.max(1, ...s.byUniverse.map((x) => x.games));
  return (
    <div>
      <section aria-labelledby="totals">
        <h2 id="totals" className="sr-only">
          Totals
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {totals.map(([k, v]) => (
            <div key={k} className="panel p-3">
              <dt className="text-muted text-xs uppercase tracking-wide">{k}</dt>
              <dd className="h-display text-4xl tabular-nums">{nf.format(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="per-day" className="panel p-4 sm:p-5 lg:col-span-2">
          <h2 id="per-day" className="h-head mb-3 text-xl">
            Last 14 days
          </h2>
          <DayChart days={s.perDay} />
        </section>

        <section aria-labelledby="by-mode" className="panel p-4 sm:p-5">
          <h2 id="by-mode" className="h-head mb-3 text-xl">
            Games by mode
          </h2>
          <BarList
            max={maxMode}
            tone="c1"
            empty="No games yet."
            items={s.byMode.map((x) => ({
              key: x.mode,
              label: x.mode === 'daily' ? 'Ranked dailies' : MODE_LABEL[x.mode],
              value: x.games,
              display: nf.format(x.games),
            }))}
          />
        </section>

        <section aria-labelledby="by-uni" className="panel p-4 sm:p-5">
          <h2 id="by-uni" className="h-head mb-3 text-xl">
            Games by universe
          </h2>
          <BarList
            max={maxUni}
            tone="c3"
            empty="No universe games yet."
            items={s.byUniverse.map((x) => ({
              key: x.universe,
              label: universeName(x.universe),
              value: x.games,
              display: `${nf.format(x.games)} ${x.games === 1 ? 'game' : 'games'}`,
              sub: x.games > 0 ? `${pct(x.accuracy)} right` : undefined,
            }))}
          />
        </section>

        <QuestionList id="hardest" title="Hardest questions" rows={s.hardest} tone="c2" />
        <QuestionList id="easiest" title="Easiest questions" rows={s.easiest} tone="c3" />
      </div>
    </div>
  );
}

function QuestionList({
  id,
  title,
  rows,
  tone,
}: {
  id: string;
  title: string;
  rows: { id: string; q: string; answered: number; accuracy: number }[];
  tone: 'c2' | 'c3';
}) {
  return (
    <section aria-labelledby={id} className="panel p-4 sm:p-5">
      <h2 id={id} className="h-head mb-1 text-xl">
        {title}
      </h2>
      <p className="mb-3 text-muted text-xs">Questions with at least 20 answers.</p>
      <BarList
        tone={tone}
        empty="Not enough answers yet."
        items={rows.map((r) => ({
          key: r.id,
          label: r.q,
          value: r.accuracy,
          display: pct(r.accuracy),
          sub: `${nf.format(r.answered)} answered`,
        }))}
      />
    </section>
  );
}
