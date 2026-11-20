import type { PollView } from '../learn/contract';
import { PollCard } from '../learn/poll-card';

/** Every Desi poll, in a tidy grid (1 column on a phone, 2 on a tablet, 3 on desktop). */
export function PollSlots({ polls }: { polls: PollView[] }) {
  if (polls.length === 0) return null;
  return (
    <section aria-labelledby="polls-h" data-testid="desi-polls">
      <p className="kicker">Your say · {polls.length} polls</p>
      <h2 id="polls-h" className="h-display ink-text mb-4 text-5xl text-c1-text sm:text-6xl">
        Desi polls
      </h2>
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {polls.map((p) => (
          <PollCard key={p.id} pollId={p.id} realm="comic" initial={p} />
        ))}
      </div>
    </section>
  );
}
