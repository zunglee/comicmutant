/** Contracts between the arena routes, the shared game shell and each game. */
import type { Fighter } from '~/lib/schema';
import type { Sfx } from './engine/audio';
import type { FxWorld } from './engine/fx';
import type { Input } from './engine/input';

export const GAME_IDS = ['fight', 'badminton', 'football', 'quiz'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Versus = 'cpu' | 'local';

export interface QuizQ {
  q: string;
  options: string[];
  answer: number;
  why: string;
  /** Character the question is about (text only — never drawn). */
  name: string;
}

export interface GameResult {
  game: GameId;
  winner: 'p1' | 'p2' | 'draw';
  score: [number, number];
  /** One-line human summary for the result screen and screen readers. */
  summary: string;
}

export interface GameProps {
  p1: Fighter;
  p2: Fighter;
  vs: Versus;
  difficulty: Difficulty;
  onEnd: (result: GameResult) => void;
  /** Quiz only. */
  questions?: QuizQ[];
}

export interface SimEnv {
  p1: Fighter;
  p2: Fighter;
  vs: Versus;
  difficulty: Difficulty;
  sfx: Sfx;
  fx: FxWorld;
  reduced: boolean;
  settings: Record<string, string>;
  /** Push a message to the aria-live region. */
  announce(msg: string): void;
  end(result: Omit<GameResult, 'game'>): void;
}

export interface Sim {
  update(dt: number, input: Input): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
  /** Plain-text state for screen readers. */
  describe(): string;
}

export interface Control {
  keys: string;
  does: string;
}

export interface StartOption {
  id: string;
  label: string;
  choices: { value: string; label: string }[];
}

export interface TouchLayout {
  /** Labels for the A/B/C buttons; omit to hide a button. */
  a?: string;
  b?: string;
  c?: string;
  /** Show up/down on the d-pad. */
  vertical?: boolean;
}

export const GAME_TITLES: Record<GameId, string> = {
  fight: 'Rumble Royale',
  badminton: 'Smash Court',
  football: 'Big Head Football',
  quiz: 'Quiz Duel',
};
