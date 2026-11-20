/**
 * FactDeck: a swipe / arrow-key deck of facts, best ("whoa") first. "Whoa, didn't know!" and "Knew it"
 * post to /api/fact-react (optimistic, reverted on an error code). Kid mode shows kid facts only, in
 * bigger type. "Facts discovered" lives in localStorage on this device only.
 */
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeckFact, FactDeckProps, FactReaction } from './contract';
import { NOTICE, postFactReact } from './games/net';
import {
  Icon,
  LearnStyles,
  Pulse,
  readJson,
  rootProps,
  shuffled,
  useDur,
  writeJson,
} from './games/shared';

export const DISCOVERED_KEY = 'cm.learn.discovered';

type Counts = { whoa: number; knew: number };
interface Row extends DeckFact {
  orig: number;
}

export function FactDeck({
  facts,
  realm,
  target,
  kid = false,
  counts,
  mine: mineIn,
  title,
}: FactDeckProps) {
  const { dur, ease, calm } = useDur(realm);
  const base = useMemo<Row[]>(
    () =>
      facts
        .map((f, orig) => ({ ...f, orig }))
        .filter((f) => !kid || f.kid)
        .sort((a, b) => b.interest - a.interest || a.orig - b.orig),
    [facts, kid],
  );
  const [order, setOrder] = useState<number[]>(() => base.map((_, i) => i));
  const [isShuffled, setShuffled] = useState(false);
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState(1);
  const [local, setLocal] = useState<Record<number, Counts>>({ ...(counts ?? {}) });
  const [mine, setMine] = useState<Record<number, FactReaction>>({ ...(mineIn ?? {}) });
  const [notice, setNotice] = useState('');
  const [pulse, setPulse] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const busy = useRef(new Set<number>());
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setOrder(base.map((_, i) => i));
    setShuffled(false);
    setPos(0);
  }, [base]);
  useEffect(() => setFound(readJson<string[]>(DISCOVERED_KEY, [])), []);

  const n = order.length;
  const row = n ? base[order[Math.min(pos, n - 1)] as number] : undefined;

  const go = useCallback(
    (d: number) => {
      if (!n) return;
      setDir(d);
      setNotice('');
      setPos((p) => (p + d + n) % n);
    },
    [n],
  );

  const markFound = (id: string, on: boolean) =>
    setFound((f) => {
      const next = on ? (f.includes(id) ? f : [...f, id]) : f.filter((x) => x !== id);
      writeJson(DISCOVERED_KEY, next);
      return next;
    });

  async function react(r: FactReaction) {
    if (!row || busy.current.has(row.orig)) return;
    const idx = row.orig;
    const prevMine = mine[idx];
    const prevCounts = local[idx] ?? { whoa: 0, knew: 0 };
    const next = { ...prevCounts };
    if (prevMine) next[prevMine] = Math.max(0, next[prevMine] - 1);
    const clearing = prevMine === r; // the same reaction again takes it back (the server toggles)
    if (!clearing) next[r] += 1;
    const id = `${target}#${idx}`;
    const wasFound = found.includes(id);
    busy.current.add(idx);
    setMine((s) => {
      const c = { ...s };
      if (clearing) delete c[idx];
      else c[idx] = r;
      return c;
    });
    setLocal((s) => ({ ...s, [idx]: next }));
    setNotice('');
    if (r === 'whoa' && !clearing) {
      markFound(id, true);
      setPulse((p) => p + 1);
    }
    const revert = (code: string) => {
      setMine((s) => {
        const c = { ...s };
        if (prevMine) c[idx] = prevMine;
        else delete c[idx];
        return c;
      });
      setLocal((s) => ({ ...s, [idx]: prevCounts }));
      if (r === 'whoa' && !clearing && !wasFound) markFound(id, false);
      setNotice(NOTICE[code] ?? (NOTICE.other as string));
    };
    const out = await postFactReact({ target, index: idx, reaction: r });
    busy.current.delete(idx);
    if (!out.ok) return revert(out.ceiling ? 'ceiling' : out.reload ? 'reload' : out.code);
    const reply = out.value;
    setLocal((s) => ({ ...s, [idx]: { whoa: reply.whoa, knew: reply.knew } }));
    setMine((s) => {
      const c = { ...s };
      if (reply.mine) c[idx] = reply.mine;
      else delete c[idx];
      return c;
    });
  }

  function shuffle() {
    const ids = base.map((_, i) => i);
    setOrder(isShuffled ? ids : shuffled(ids));
    setShuffled(!isShuffled);
    setDir(1);
    setPos(0);
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  const text = kid ? 'text-2xl leading-snug' : 'text-lg leading-relaxed';
  const cur = row ? (local[row.orig] ?? { whoa: 0, knew: 0 }) : null;
  const my = row ? mine[row.orig] : undefined;
  const from = Math.max(0, Math.min(pos - 4, n - 9));
  const dots = Array.from({ length: Math.min(n, 9) }, (_, i) => from + i);
  const tally = cur && cur.whoa + cur.knew > 0 ? `${cur.whoa} said whoa, ${cur.knew} knew it` : '';

  return (
    <section
      {...rootProps(realm)}
      data-testid="fact-deck"
      aria-label={title ?? 'Fact deck'}
      className="lw relative mx-auto w-full max-w-xl"
    >
      <LearnStyles />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="lw-title text-2xl">{title ?? 'Did you know?'}</h2>
        <p className="lw-muted text-sm" data-testid="discovered">
          Facts discovered: <strong>{found.length}</strong>
        </p>
      </div>

      {!row || !cur ? (
        <p className="lw-card p-5" role="status">
          {kid ? 'Kid facts are on their way. Check back soon.' : 'Facts are on their way.'}
        </p>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: a carousel group with arrow-key support.
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label="Facts. Use the left and right arrow keys."
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard target for arrow-key paging.
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            start.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const s = start.current;
            start.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5)
              go(dx < 0 ? 1 : -1);
          }}
          className="relative rounded-[var(--lw-r)]"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="relative" style={{ minHeight: kid ? 300 : 260 }}>
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <m.article
                key={`${pos}-${row.orig}`}
                custom={dir}
                variants={{
                  in: (d: number) => ({
                    opacity: 0,
                    x: d * (calm ? 36 : 70),
                    rotate: realm === 'comic' ? d * 4 : 0,
                  }),
                  show: { opacity: 1, x: 0, rotate: 0 },
                  out: (d: number) => ({
                    opacity: 0,
                    x: -d * (calm ? 36 : 70),
                    rotate: realm === 'comic' ? -d * 4 : 0,
                  }),
                }}
                initial="in"
                animate="show"
                exit="out"
                transition={{ duration: dur(0.3), ease }}
                className="lw-card relative flex w-full flex-col gap-4 p-5"
                data-testid="fact-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="lw-chip">{row.kind}</span>
                  <span className="lw-muted text-sm" data-testid="fact-pos">
                    Fact {pos + 1} of {n}
                  </span>
                </div>
                <p className={text} data-testid="fact-text">
                  {row.text}
                </p>
                <a
                  className="lw-link inline-flex min-h-11 items-center text-sm"
                  href={row.source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source: {hostOf(row.source)}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </m.article>
            </AnimatePresence>
          </div>

          <div className="relative mt-3 grid grid-cols-2 gap-3">
            <Pulse realm={realm} run={pulse} />
            <button
              type="button"
              className="lw-btn"
              data-primary
              aria-pressed={my === 'whoa'}
              onClick={() => react('whoa')}
            >
              <Icon name={my === 'whoa' ? 'check' : 'spark'} /> Whoa, didn't know!
            </button>
            <button
              type="button"
              className="lw-btn"
              aria-pressed={my === 'knew'}
              onClick={() => react('knew')}
            >
              <Icon name={my === 'knew' ? 'check' : 'thumb'} /> Knew it
            </button>
          </div>
          <p
            className="lw-muted mt-2 min-h-6 text-center text-sm"
            role="status"
            data-testid="fact-note"
          >
            {notice || tally}
          </p>
        </div>
      )}

      {row && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="lw-btn"
            onClick={() => go(-1)}
            aria-label="Previous fact"
          >
            <span aria-hidden>{'←'}</span>
          </button>
          <div className="flex items-center gap-1.5" aria-hidden>
            {dots.map((d) => (
              <span
                key={d}
                className="block round"
                style={{
                  width: d === pos ? 18 : 9,
                  height: 9,
                  background: d === pos ? 'var(--lw-accent)' : 'var(--lw-line)',
                  transition: 'width .6s',
                }}
              />
            ))}
          </div>
          <button type="button" className="lw-btn" onClick={shuffle} aria-pressed={isShuffled}>
            <Icon name="shuffle" /> {isShuffled ? 'Best first' : 'Shuffle'}
          </button>
          <button type="button" className="lw-btn" onClick={() => go(1)} aria-label="Next fact">
            <span aria-hidden>{'→'}</span>
          </button>
        </div>
      )}
    </section>
  );
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}
