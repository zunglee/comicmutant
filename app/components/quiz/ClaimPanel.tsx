/** Back from joining with a guest game waiting: attach it to the new account (POST /api/quiz/claim). */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { QuizClaimReply } from '~/lib/quiz-contract';
import { claimGame, type Failure } from './api';
import { fmt } from './daily';
import { clearPending, type PendingGame, readPending } from './pending';

export function ClaimPanel({ signedIn }: { signedIn: boolean }) {
  const [game, setGame] = useState<PendingGame | null>(null);
  const [reply, setReply] = useState<(QuizClaimReply | Failure) | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Once per mount, even when the effect runs twice: the entry is taken out before posting.
    if (!signedIn || started.current) return;
    const g = readPending();
    if (!g) return;
    started.current = true;
    clearPending();
    setGame(g);
    void claimGame({ game: g.game }).then((r) => {
      setReply(r);
      // A dropped connection keeps the game for another try; any server answer is final.
      if (!r.ok && 'network' in r && r.network) started.current = false;
    });
  }, [signedIn]);

  if (!game) return null;
  const pts = fmt(game.score);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <div role="status" className="bubble">
        {reply === null && <p>Saving your guest score ({pts} points)…</p>}
        {reply?.ok && (
          <p>
            <strong>Saved!</strong> Your {game.label} game ({game.correct}/{game.total}, {pts}{' '}
            points) is on your account.
            {reply.summary.held
              ? ' It is held for a quick moderator check before it shows on a board.'
              : reply.summary.rank !== null && reply.summary.board
                ? ` You are #${reply.summary.rank} on ${reply.summary.board}.${
                    reply.summary.nameWithheld
                      ? ' Your name shows after a quick check by a mod.'
                      : ''
                  }`
                : reply.summary.ranked
                  ? ''
                  : ' It was played as a guest, so it stays off the boards.'}{' '}
            <Link to="/quiz/leaders" className="underline">
              See the boards
            </Link>
          </p>
        )}
        {reply && !reply.ok && (
          <p>
            {reply.error}{' '}
            {'network' in reply && reply.network
              ? 'Check your connection and reload this page to try again.'
              : ''}
          </p>
        )}
      </div>
    </div>
  );
}
