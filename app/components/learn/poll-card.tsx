/**
 * PollCard: vote, watch the bars fill, change your mind any time. Your choice is marked with a tick
 * and the words "Your choice" (never colour alone). Talks to /api/poll (contract: PollView).
 */
import { m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { PollCardProps, PollView } from './contract';
import { getPoll, NOTICE, postVote } from './games/net';
import { LearnStyles, rootProps, useDur } from './games/shared';

export function PollCard({ pollId, realm, initial }: PollCardProps) {
  const { dur, ease } = useDur(realm);
  const [poll, setPoll] = useState<PollView | null>(initial ?? null);
  const [note, setNote] = useState('');
  const busy = useRef(false);

  useEffect(() => {
    if (initial) return;
    let live = true;
    getPoll(pollId).then((r) => {
      if (!live) return;
      if (r.ok) setPoll(r.value);
      else setNote(NOTICE[r.code] ?? '');
    });
    return () => {
      live = false;
    };
  }, [pollId, initial]);

  async function vote(option: string) {
    if (!poll || busy.current || poll.mine === option) return;
    const before = poll;
    busy.current = true;
    setNote('');
    setPoll({
      ...poll,
      mine: option,
      total: poll.total + (poll.mine ? 0 : 1),
      options: poll.options.map((o) => ({
        ...o,
        votes: o.votes + (o.id === option ? 1 : 0) - (o.id === poll.mine ? 1 : 0),
      })),
    });
    const out = await postVote(pollId, option);
    busy.current = false;
    if (out.ok) setPoll(out.value);
    else {
      setPoll(before);
      setNote(
        NOTICE[out.ceiling ? 'ceiling' : out.reload ? 'reload' : out.code] ??
          (NOTICE.other as string),
      );
    }
  }

  return (
    <section
      {...rootProps(realm)}
      aria-label="Poll"
      className="lw mx-auto w-full max-w-xl"
      data-testid="poll-card"
    >
      <LearnStyles />
      <div className="lw-card p-5">
        {!poll ? (
          <p role="status" className="lw-muted">
            {note || 'Loading the poll…'}
          </p>
        ) : (
          <>
            <h3 className="lw-title mb-1 text-2xl" id={`poll-${poll.id}`}>
              {poll.question}
            </h3>
            <p className="lw-muted mb-4 text-sm">
              {poll.mine
                ? 'You can change your vote any time.'
                : 'Pick one to see how others chose.'}
            </p>
            <ul className="grid gap-3" aria-labelledby={`poll-${poll.id}`}>
              {poll.options.map((o) => {
                const pct = poll.total > 0 ? Math.round((o.votes / poll.total) * 100) : 0;
                const mine = poll.mine === o.id;
                const shown = poll.mine !== null; // results stay hidden until you have voted
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="lw-btn relative w-full flex-col items-stretch overflow-hidden text-left"
                      aria-pressed={mine}
                      onClick={() => vote(o.id)}
                      data-testid="poll-option"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-lg">{o.label}</span>
                        {shown && (
                          <span className="text-sm whitespace-nowrap" data-testid="poll-pct">
                            {mine && (
                              <span style={{ color: 'var(--lw-good)' }}>
                                <span aria-hidden>{'✓ '}</span>Your choice{' · '}
                              </span>
                            )}
                            {pct}% ({o.votes})
                          </span>
                        )}
                      </span>
                      {shown && (
                        <span
                          aria-hidden
                          className="relative mt-1 block h-3 overflow-hidden round"
                          style={{ background: 'var(--lw-bg)' }}
                        >
                          <m.span
                            className="absolute inset-0 block round"
                            style={{
                              transformOrigin: 'left center',
                              background: mine ? 'var(--lw-good)' : 'var(--lw-accent)',
                            }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: pct / 100 }}
                            transition={{ duration: dur(0.5), ease }}
                          />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="lw-muted mt-3 min-h-6 text-sm" role="status" data-testid="poll-note">
              {note ||
                (poll.mine !== null ? `${poll.total} ${poll.total === 1 ? 'vote' : 'votes'}` : '')}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
