import { GameShell } from '../shell/GameShell';
import type { GameProps } from '../types';
import { FootballSim } from './sim';

const P1 = [
  { keys: 'A / D', does: 'Run' },
  { keys: 'W', does: 'Jump / header' },
  { keys: 'F', does: 'Kick (ball behind you: back-heel flick)' },
  { keys: 'G', does: 'Chip (lob)' },
  { keys: 'H', does: 'Power shot (full meter)' },
];
const P2 = [
  { keys: '← / →', does: 'Run' },
  { keys: '↑', does: 'Jump / header' },
  { keys: 'J', does: 'Kick (ball behind you: back-heel flick)' },
  { keys: 'K', does: 'Chip (lob)' },
  { keys: 'L', does: 'Power shot (full meter)' },
];

export default function FootballGame(props: GameProps) {
  return (
    <GameShell
      {...props}
      game="football"
      blurb="Two 45-second halves, one ball. You attack the goal on the right. Headers count, the conceding side kicks off, and a full meter buys a power shot that flattens whoever it hits."
      controls={{ p1: P1, p2: P2 }}
      touch={{ a: 'Kick', b: 'Chip', c: 'Power' }}
      create={(env) => new FootballSim(env)}
    />
  );
}
