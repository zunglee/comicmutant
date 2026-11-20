import type { DeckFact, Realm } from '../contract';

/** The slim figure the Learning Garden games receive (kid facts only, no long text). */
export interface LearnFigure {
  slug: string;
  name: string;
  native?: string;
  aka: string[];
  tradition: string;
  group: string;
  order: number;
  role: string;
  emblems: string[];
  symbol: string;
  palette: { c1: string; c2: string };
  kidSummary?: string;
  /** Lifespan or era, when known ("1469-1539"). */
  years?: string;
  facts: DeckFact[];
}

export interface GameProps {
  figures: LearnFigure[];
  onExit: () => void;
  realm?: Realm;
}
