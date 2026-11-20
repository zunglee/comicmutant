/**
 * Contract between the interactive widgets (app/components/learn/**), the pages that place them
 * (Sacred India, /desi, character pages) and the poll/reaction API (app/.server/polls.ts).
 * See reports/sacred-design.md. Change only with Batman.
 */

/** Which skin a widget wears: the calm Sacred India realm or the comic site. */
export type Realm = 'sacred' | 'comic';

/** A fact as the widgets see it (Figure.facts and Character.facts both fit). */
export interface DeckFact {
  text: string;
  kind: string;
  source: string;
  interest: number;
  kid?: boolean;
}

export interface FactDeckProps {
  facts: readonly DeckFact[];
  realm: Realm;
  /** Reaction target, e.g. "sacred:ganesha" or "desi:nagraj". */
  target: string;
  /** Kid mode: only kid facts, bigger type, gentler copy. */
  kid?: boolean;
  /** Server counts per fact index, from the page loader (factReactions()). */
  counts?: Readonly<Record<number, { whoa: number; knew: number }>>;
  title?: string;
  /** The caller's own reactions per fact index, from the page loader (myFactReactions()). */
  mine?: Readonly<Record<number, FactReaction>>;
}

export interface PollCardProps {
  pollId: string;
  realm: Realm;
  /** Server snapshot from the loader so the card paints without a fetch. */
  initial?: PollView;
}

/** GET /api/poll?id=… and POST /api/poll {id, option} both return this. */
export interface PollView {
  id: string;
  question: string;
  options: { id: string; label: string; votes: number }[];
  total: number;
  /** The caller's current choice (fan or guest voter), or null. */
  mine: string | null;
}

/** POST /api/fact-react {target, index, reaction} → counts for that fact. */
export type FactReaction = 'whoa' | 'knew';
export interface FactReactBody {
  target: string;
  index: number;
  reaction: FactReaction;
}
export interface FactReactReply {
  index: number;
  whoa: number;
  knew: number;
  mine: FactReaction | null;
}

/** Stable error codes from both endpoints (never parse message text). */
export const LEARN_ERROR_CODES = ['invalid', 'unknown', 'rate', 'closed', 'other'] as const;
export type LearnErrorCode = (typeof LEARN_ERROR_CODES)[number];
export interface LearnError {
  error: string;
  code: LearnErrorCode;
}
