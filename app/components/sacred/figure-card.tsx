/**
 * The Sacred India "character card": front = animated symbol art, name, native script, role;
 * back = the three most interesting facts. A flip card that works by keyboard (Enter / Space on the
 * front, then Tab to the link or the flip-back button) and by touch. The face that is turned away
 * is `inert`, so it can never take focus or be read twice.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { SymbolArt } from './symbol-art';
import { groupLabel, type SacredCardData } from './types';
import { UNNUMBERED } from './unnumbered';

export function FigureCard({
  card,
  priority = false,
  num,
  tag,
}: {
  card: SacredCardData;
  priority?: boolean;
  /** A closing card of a lineage, shown instead of a number. */
  tag?: string;
  /** Position in an ordered lineage (Gurus, Tirthankaras, avatars). */
  num?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  // The back face is built on the first flip, so a page of cards ships (and hydrates) front faces only.
  const [built, setBuilt] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const front = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  // After a flip, focus follows the face that is now showing.
  useEffect(() => {
    if (!moved.current) return;
    (flipped ? back.current : front.current)?.focus({ preventScroll: true });
  }, [flipped]);
  const flip = (to: boolean) => {
    moved.current = true;
    if (to) setBuilt(true);
    setFlipped(to);
  };
  const { c1, c2 } = card.palette;
  const tint = { '--sc-a': c1, '--sc-b': c2 } as React.CSSProperties;

  if (!card.ready) {
    return (
      <article
        className="sacred-card sc-soon"
        style={tint}
        aria-label={`${card.name}, profile coming soon`}
      >
        <div className="sc-face sc-front">
          {(num || tag) && (
            <span className={tag ? 'sc-num sc-tag' : 'sc-num'} aria-hidden={tag ? undefined : true}>
              {tag ?? num}
            </span>
          )}
          <div className="sc-art opacity-60">
            <SymbolArt symbol={card.symbol} c1={c1} c2={c2} live={false} />
          </div>
          <h3 className="sc-name">{card.name}</h3>
          <p className="sc-role">Profile coming soon</p>
        </div>
      </article>
    );
  }

  return (
    <article
      className="sacred-card"
      data-flipped={flipped}
      data-priority={priority || undefined}
      style={tint}
    >
      <div className="sc-inner">
        <div className="sc-face sc-front" inert={flipped}>
          {(num || tag) && (
            <span className={tag ? 'sc-num sc-tag' : 'sc-num'} aria-hidden={tag ? undefined : true}>
              {tag ?? num}
            </span>
          )}
          <button ref={front} type="button" className="sc-hit" onClick={() => flip(true)}>
            <span className="sc-art">
              <SymbolArt symbol={card.symbol} c1={c1} c2={c2} live={false} />
            </span>
            <span className="sc-name">{card.name}</span>
            {card.native && (
              <span lang={card.tradition === 'sikh' ? 'pa' : 'hi'} className="sc-native">
                {card.native}
              </span>
            )}
            <span className="sc-role">{card.role}</span>
            <span className="sc-hint" aria-hidden>
              {groupLabel(card.group)} · tap to turn
            </span>
            <span className="sr-only">. Turn the card to read facts</span>
          </button>
          <Link to={`/sacred/f/${card.slug}`} className="sc-readlink">
            Read profile<span className="sr-only">: {card.name}</span>
          </Link>
        </div>
        {built && (
          <div className="sc-face sc-back" inert={!flipped}>
            <p className="sc-kicker">{card.name}: three things to know</p>
            <ul className="sc-facts">
              {card.facts.map((fa) => (
                <li key={fa.text}>{fa.text}</li>
              ))}
            </ul>
            <div className="sc-actions">
              <Link to={`/sacred/f/${card.slug}`} className="sc-link">
                Read the profile
              </Link>
              <button ref={back} type="button" className="sc-flip" onClick={() => flip(false)}>
                Turn back
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export function CardGrid({
  cards,
  row = false,
  ordered = false,
  className = '',
}: {
  cards: SacredCardData[];
  /** On phones, one horizontal snap row instead of a wrapped grid. */
  row?: boolean;
  /** A lineage with a fixed order (Gurus, Tirthankaras, avatars): numbered 1..N. */
  ordered?: boolean;
  className?: string;
}) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={`sacred-grid ${row ? 'sacred-grid-row' : ''} ${className}`}>
      {cards.map((c, i) => {
        const tag = ordered ? UNNUMBERED[c.slug] : undefined;
        // The count runs over the numbered cards only; a closing card carries its own label.
        const n =
          ordered && !tag
            ? cards.slice(0, i).filter((x) => !UNNUMBERED[x.slug]).length + 1
            : undefined;
        return (
          <li key={c.slug} className="sc-cell">
            <FigureCard card={c} priority={i < 4} num={n} tag={tag} />
          </li>
        );
      })}
    </Tag>
  );
}
