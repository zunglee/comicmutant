/** The /mod/quiz queue items: a trust check, a held game, a reported fact, plus their shared pieces. */
import { Form, Link } from 'react-router';
import type { HeldGame, QuizSignal, ReportRow } from '~/lib/quiz-contract';
import { MODE_LABEL, nf, safeHref, shortDate } from './format';
import type { TrustGroup } from './trust-group';
import { TrustTimes } from './trust-times';

const pts = (n: number) => `${nf.format(n)} ${n === 1 ? 'pt' : 'pts'}`;

/** Which trust cap approving a game sets: the daily podium is per game, facts adds a count, the rest scale by score. */
function approveKind(board: string): 'daily' | 'facts' | 'universe' {
  // The core joins the boards a game counts on ("DC best + Facts known"); the first one is its own.
  const own = board.split(' + ')[0] ?? board;
  if (/daily/i.test(own)) return 'daily';
  if (/facts/i.test(own)) return 'facts';
  return 'universe';
}

/** What Approve will do, said plainly before the mod presses it (the core's reply then confirms it). */
function approveEffect(board: string, score: number, maxScore: number): string {
  const own = board.split(' + ')[0] ?? board;
  const k = approveKind(board);
  if (k === 'daily') return `Approve: this game's name shows on Today's daily (this game only).`;
  if (k === 'facts')
    return `Approve: names show on Facts known up to their current facts count plus 30.`;
  const top = Math.floor(score * 1.1);
  // At or past the best possible game the cap can never bite, and the core's reply says so.
  if (top >= maxScore) return `Approve: this covers any score on ${own}.`;
  return `Approve: names show on ${own} up to 1.1× this score (${nf.format(top)} points).`;
}

const isTight = (x: QuizSignal) => /tight band/i.test(x.text);

/**
 * Scouting signals: the clues that a fast game was prepared (or scripted). Strong ones (the same
 * browser, other fans' games) are bold with a warning mark; weak ones (the same network, which can be
 * carrier NAT) are muted. They come first and say so when there are none. A tight-band signal is
 * spelled out: it is a clue, not proof, since honest experts can trip it too.
 */
export function Signals({ signals }: { signals: QuizSignal[] }) {
  const strong = signals.filter((x) => x.strong);
  const weak = signals.filter((x) => !x.strong);
  const tight = signals.some(isTight);
  return (
    <div
      className={`rounded border-2 border-line p-2 text-sm ${strong.length > 0 ? 'bg-c3 text-on-c3' : 'bg-bg'}`}
    >
      <p className="font-bold">
        {signals.length === 0
          ? 'Scouting signals: none found'
          : `Scouting signals (${signals.length}): ${strong.length} strong, ${weak.length} weak`}
      </p>
      {strong.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {strong.map((x) => (
            <li key={x.text} className="font-bold">
              <span aria-hidden>⚠ </span>
              <span className="sr-only">Strong signal: </span>
              {x.text}
            </li>
          ))}
        </ul>
      )}
      {weak.length > 0 && (
        <ul
          className={`${strong.length > 0 ? 'mt-1' : 'mt-1 text-muted'} list-disc space-y-0.5 pl-5 text-xs`}
        >
          {weak.map((x) => (
            <li key={x.text}>
              <span className="sr-only">Weak signal: </span>
              {x.text}
            </li>
          ))}
        </ul>
      )}
      {tight && (
        <p className="mt-1 text-xs">
          Tight band: the answers beat the reading floor by almost the same margin every time, which
          a script does. Honest experts can do it too, so weigh it with the other signals.
        </p>
      )}
    </div>
  );
}

/** Where the fan sits (first three) and any other reason (always shown); the rest of the places fold away. */
function TrustReasons({ reasons }: { reasons: string[] }) {
  const placements = reasons.filter((x) => x.startsWith('#'));
  const others = reasons.filter((x) => !x.startsWith('#'));
  const shown = [...placements.slice(0, 3), ...others];
  const more = placements.slice(3);
  return (
    <div className="text-sm">
      <span className="text-muted">Why it's here:</span>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {shown.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {more.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted underline">
            and {more.length} more {more.length === 1 ? 'place' : 'places'}
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {more.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function TrustItem({ t, maxScore }: { t: TrustGroup; maxScore: number }) {
  return (
    <li className="panel space-y-3 p-4">
      <p className="text-sm">
        <b>{t.name}</b> · {t.label} · {shortDate(t.at)} · {t.correct}/{t.total} right ·{' '}
        {pts(t.score)}
      </p>
      <Signals signals={t.signals} />
      <TrustTimes times={t.times} floors={t.floors} />
      <div>
        <h3 className="h-head mb-2 text-lg">
          {t.boards.length === 1 ? 'Board waiting on this game' : 'Boards waiting on this game'}
        </h3>
        <ul className="space-y-3">
          {t.boards.map((b) => (
            <li key={b.board} className="space-y-2 rounded border-2 border-line bg-bg p-3">
              <h4 className="font-bold">{b.board}</h4>
              <TrustReasons reasons={b.reasons} />
              <Form method="post" className="space-y-1">
                <input type="hidden" name="game" value={t.gameId} />
                <input type="hidden" name="board" value={b.board} />
                <button
                  className="btn btn-sm btn-c3"
                  name="call"
                  value="trust-approve"
                  type="submit"
                >
                  Approve for {b.board}
                </button>
                <p className="text-muted text-xs">{approveEffect(b.board, t.score, maxScore)}</p>
              </Form>
            </li>
          ))}
        </ul>
      </div>
      <Form method="post" className="space-y-2 border-line border-t-2 pt-3">
        <input type="hidden" name="game" value={t.gameId} />
        <input type="hidden" name="fan" value={t.userId} />
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-sm btn-c1"
            name="call"
            value="trust-reject"
            type="submit"
            onClick={(e) => {
              if (
                !confirm(
                  `Reject this game by ${t.name}? It goes off every board, its facts are removed, and ${t.name}'s caps (including Facts known) reset.`,
                )
              )
                e.preventDefault();
            }}
          >
            Reject game
          </button>
          <button
            className="btn btn-sm"
            name="call"
            value="reject-fan"
            type="submit"
            onClick={(e) => {
              if (
                !confirm(
                  `Reject every game by ${t.name}? They come off the boards and every cap resets.`,
                )
              )
                e.preventDefault();
            }}
          >
            Reject all by {t.name}
          </button>
        </div>
        <p className="text-muted text-xs">
          Reject game takes this game off every board, removes its facts and resets {t.name}'s caps,
          Facts known included. Reject all does that for every game they have played.
        </p>
      </Form>
    </li>
  );
}

/** The board a held game is on, as the core names it: its own daily/universe board, or Facts known. */
function heldBoard(g: HeldGame): string {
  if (g.mode === 'daily') return 'Today\u2019s daily';
  if (g.mode === 'universe') return `${g.label} best`;
  return 'Facts known';
}

export function HeldItem({ g }: { g: HeldGame }) {
  const board = heldBoard(g);
  return (
    <li className="panel space-y-3 p-4">
      <p className="text-sm">
        <b>{g.name}</b> ·{' '}
        {g.label === MODE_LABEL[g.mode] ? g.label : `${g.label} (${MODE_LABEL[g.mode]})`} ·{' '}
        {shortDate(g.at)} · {g.correct}/{g.total} right · {pts(g.score)}
      </p>
      <p className="text-sm">
        <span className="text-muted">Why it's here:</span>{' '}
        <span className="whitespace-pre-line">{g.reason}</span>
      </p>
      {g.more ? (
        <p className="font-semibold text-sm">
          +{g.more} more held today
          <span className="font-normal text-muted">
            {' '}
            (this is the latest; rejecting all by {g.name} clears them too)
          </span>
        </p>
      ) : null}
      <Signals signals={g.signals} />
      <TrustTimes times={g.times} floors={g.floors} />
      <Form method="post" className="space-y-2">
        <input type="hidden" name="game" value={g.id} />
        <input type="hidden" name="board" value={board} />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm btn-c3" name="call" value="approve" type="submit">
            Approve for {board}
          </button>
          <button
            className="btn btn-sm btn-c1"
            name="call"
            value="reject"
            type="submit"
            onClick={(e) => {
              if (!confirm(`Reject ${g.name}'s game? It stays off every board.`))
                e.preventDefault();
            }}
          >
            Reject
          </button>
          <button
            className="btn btn-sm"
            name="call"
            value="reject-fan-game"
            type="submit"
            onClick={(e) => {
              if (
                !confirm(
                  `Reject every game by ${g.name}? They come off the boards and every cap resets.`,
                )
              )
                e.preventDefault();
            }}
          >
            Reject all by {g.name}
          </button>
        </div>
        <p className="text-muted text-xs">
          {board === 'Facts known'
            ? 'Approve = this game only: credits its facts to Facts known, sets no cap.'
            : `Approve = this game only on ${board}, credits its facts, sets no cap.`}{' '}
          Reject keeps it off every board.
        </p>
      </Form>
    </li>
  );
}

export function ReportItem({ r }: { r: ReportRow }) {
  const href = safeHref(r.source);
  return (
    <li className="panel space-y-2 p-4">
      <p className="text-muted text-xs">
        {r.reports} {r.reports === 1 ? 'report' : 'reports'} · <code>{r.questionId}</code>
        {r.retired && <span className="chip pointer-events-none ml-2">Retired</span>}
      </p>
      <p className="font-semibold">{r.q}</p>
      <p className="text-sm">
        <span className="text-muted">Our answer:</span> {r.answer}
      </p>
      <p className="text-sm">
        <span className="text-muted">Why:</span> {r.why}
      </p>
      <p className="break-words text-sm">
        <span className="text-muted">Source:</span>{' '}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
            {href}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          r.source || 'none given'
        )}
      </p>
      {r.reasons.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Reasons:</span>
          {r.reasons.map((x, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same reason can repeat.
            <span key={i} className="chip pointer-events-none">
              {x}
            </span>
          ))}
        </p>
      )}
      {r.notes.length > 0 && (
        <div className="text-sm">
          <span className="text-muted">Notes from players:</span>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {r.notes.map((n, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: notes can repeat.
              <li key={i} className="break-words">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Form method="post" className="pt-1">
        <input type="hidden" name="question" value={r.questionId} />
        {r.retired ? (
          <button className="btn btn-sm" name="call" value="restore" type="submit">
            Restore
          </button>
        ) : (
          <button className="btn btn-sm btn-c1" name="call" value="retire" type="submit">
            Retire
          </button>
        )}
      </Form>
    </li>
  );
}

/** Newer / older page links for a queue, keeping the tab in the URL. */
export function Pager({
  tab,
  page,
  per,
  total,
}: {
  tab: string;
  page: number;
  per: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return null;
  const to = (p: number) => `?tab=${tab}${p > 0 ? `&p=${p}` : ''}`;
  return (
    <nav aria-label="Queue pages" className="mt-4 flex flex-wrap items-center gap-2">
      {page > 0 && (
        <Link to={to(page - 1)} className="btn btn-sm">
          ← Previous
        </Link>
      )}
      <span className="text-muted text-sm">
        Page {page + 1} of {pages} · {total} items
      </span>
      {page + 1 < pages && (
        <Link to={to(page + 1)} className="btn btn-sm">
          Next →
        </Link>
      )}
    </nav>
  );
}
