/** Fact Garden: read a kid fact, say "Whoa!", and a flower grows in your garden (kept on this device). */
import { m } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { gardenFacts, gardenQuestion, rng } from './logic';
import { hash01, Icon, useDur, useStored } from './shared';
import type { GameProps } from './types';
import { GameShell, MORE_ARRIVING, Note, useSeed } from './ui';

export const GARDEN_KEY = 'cm.learn.garden';
const HUES = [345, 28, 48, 290, 8, 200];

function Flower({ id, grow }: { id: string; grow: boolean }) {
  const { dur } = useDur('sacred');
  const hue = HUES[Math.floor(hash01(id) * HUES.length)] as number;
  const lean = (hash01(id, 3) - 0.5) * 14;
  return (
    <m.svg
      viewBox="0 0 48 64"
      width={48}
      height={64}
      aria-hidden
      focusable="false"
      initial={grow ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: dur(1.2), ease: [0.22, 0.8, 0.3, 1] }}
      style={{ transformOrigin: '50% 100%', rotate: lean }}
    >
      <path d="M24 62 Q22 44 24 28" stroke="#3f7d4e" strokeWidth="3" fill="none" />
      <path d="M23 50 Q10 46 8 38 Q20 38 23 50Z" fill="#5a9b66" />
      {[0, 60, 120, 180, 240, 300].map((r) => (
        <ellipse
          key={r}
          cx="24"
          cy="14"
          rx="5"
          ry="10"
          fill={`hsl(${hue} 75% 70%)`}
          stroke={`hsl(${hue} 55% 45%)`}
          strokeWidth="1"
          transform={`rotate(${r} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="5" fill="#f7b32b" />
    </m.svg>
  );
}

export default function FactGarden({ figures, onExit, realm = 'sacred' }: GameProps) {
  const { dur, ease } = useDur(realm);
  const facts = useMemo(() => gardenFacts(figures), [figures]);
  const [seed, again] = useSeed();
  const [planted, setPlanted] = useStored<string[]>(GARDEN_KEY, []);
  // The fact on screen is pinned by id: planting its flower must not swap it for another.
  const [curId, setCurId] = useState<string | null>(null);
  const [lastGrown, setLastGrown] = useState<string | null>(null);

  const queue = useMemo(
    () =>
      seed === null ? facts : [...facts].sort((a, b) => hash01(a.id, seed) - hash01(b.id, seed)),
    [facts, seed],
  );
  const fresh = queue.filter((f) => !planted.includes(f.id));
  const list = fresh.length ? fresh : queue;
  const cur = (curId ? queue.find((f) => f.id === curId) : undefined) ?? list[0];
  const enough = new Set(facts.map((f) => f.slug)).size >= 4;
  const q = useMemo(
    () =>
      cur && seed !== null
        ? gardenQuestion(cur, facts, rng(seed + Math.floor(hash01(cur.id) * 1e6)))
        : null,
    [cur, facts, seed],
  );
  const [wrong, setWrong] = useState<string[]>([]);
  const [right, setRight] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new fact starts a fresh question.
  useEffect(() => {
    setWrong([]);
    setRight(false);
  }, [cur?.id]);
  const grower = useRef<HTMLButtonElement>(null);
  // The guess buttons leave once the answer is right: hand focus to the next sensible control.
  useEffect(() => {
    if (right) grower.current?.focus({ preventScroll: true });
  }, [right]);
  const already = cur ? planted.includes(cur.id) : false;

  function another() {
    if (!cur) return;
    const i = queue.findIndex((f) => f.id === cur.id);
    for (let k = 1; k <= queue.length; k++) {
      const c = queue[(i + k) % queue.length];
      if (c && c.id !== cur.id && !planted.includes(c.id)) return setCurId(c.id);
    }
    const c = queue[(i + 1) % queue.length];
    if (c) setCurId(c.id);
  }

  function whoa() {
    if (!cur || already || !right) return;
    setCurId(cur.id);
    setPlanted((p) => [...p, cur.id]);
    setLastGrown(cur.id);
  }

  return (
    <GameShell
      realm={realm}
      title="Fact Garden"
      hint="Work out who a fact is about. Then, if it makes you say whoa, a flower grows. Your garden stays on this device."
      onExit={onExit}
      testId="game-garden"
    >
      {!cur || !enough ? (
        <Note>{MORE_ARRIVING}</Note>
      ) : !q ? (
        <Note>Picking a fact{'\u2026'}</Note>
      ) : (
        <>
          <m.article
            key={cur.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur(0.35), ease }}
            className="lw-card p-5"
            data-testid="garden-fact"
          >
            <p className="lw-muted mb-1 text-sm">
              {right ? `About ${cur.who}` : 'Who is this fact about?'}
            </p>
            <p className="text-2xl leading-snug" data-testid="garden-text">
              {right ? cur.text : q.masked}
            </p>
            {!right && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Who could it be?">
                {q.options.map((o) => {
                  const bad = wrong.includes(o.slug);
                  return (
                    <li key={o.slug}>
                      <button
                        type="button"
                        className="lw-btn w-full"
                        aria-disabled={bad || undefined}
                        data-testid="garden-guess"
                        onClick={() => {
                          if (bad) return;
                          if (o.slug === cur.slug) {
                            setCurId(cur.id); // pin it: planting must not swap the fact away
                            setRight(true);
                          } else setWrong((w) => [...w, o.slug]);
                        }}
                      >
                        {o.name}
                        {o.tag && <span className="lw-muted text-sm"> ({o.tag})</span>}
                        {bad && <span className="text-sm"> (not this one)</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 min-h-6 text-lg" role="status">
              {right
                ? `Yes, it is ${cur.who}!`
                : wrong.length
                  ? 'Not this one. Have another go, no hurry.'
                  : ''}
            </p>
            {right && (
              <a
                className="lw-link inline-flex min-h-11 items-center text-sm"
                href={cur.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </m.article>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="lw-btn"
              data-primary
              aria-disabled={already || !right}
              onClick={whoa}
              ref={grower}
              data-testid="garden-grow"
            >
              <Icon name="flower" /> {already ? 'Flower planted' : 'Whoa! Grow a flower'}
            </button>
            <button type="button" className="lw-btn" onClick={another}>
              Another fact
            </button>
            <button
              type="button"
              className="lw-btn"
              onClick={() => {
                setCurId(null);
                again();
              }}
            >
              Shuffle facts
            </button>
          </div>
          <h3 className="lw-title mt-6 mb-2 text-2xl">Your garden</h3>
          <p className="lw-muted mb-2" role="status" data-testid="garden-count">
            {planted.length === 0
              ? 'Nothing planted yet.'
              : `${planted.length} ${planted.length === 1 ? 'flower' : 'flowers'} growing.`}
          </p>
          <ul
            className="lw-card flex min-h-24 flex-wrap items-end gap-1 p-3"
            aria-label="Flowers in your garden"
            data-testid="garden"
          >
            {planted.map((id) => (
              <li key={id}>
                <Flower id={id} grow={id === lastGrown} />
              </li>
            ))}
          </ul>
        </>
      )}
    </GameShell>
  );
}
