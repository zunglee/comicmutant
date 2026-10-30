import { GameShell } from '../shell/GameShell';
import type { GameProps } from '../types';
import { FightSim } from './sim';

const P1 = [
  { keys: 'A / D', does: 'Walk (hold back = block)' },
  { keys: 'W', does: 'Jump' },
  { keys: 'S', does: 'Crouch (S + F = uppercut)' },
  { keys: 'F', does: 'Punch' },
  { keys: 'G', does: 'Kick' },
  { keys: 'H', does: 'Special (half meter)' },
];
const P2 = [
  { keys: '← / →', does: 'Walk (hold back = block)' },
  { keys: '↑', does: 'Jump' },
  { keys: '↓', does: 'Crouch (↓ + J = uppercut)' },
  { keys: 'J', does: 'Punch' },
  { keys: 'K', does: 'Kick' },
  { keys: 'L', does: 'Special (half meter)' },
];

export default function FightGame(props: GameProps) {
  return (
    <GameShell
      {...props}
      game="fight"
      blurb="Best of three rounds. Land hits to fill your meter, chain punch → kick → uppercut, and cash in your special when it glows."
      controls={{ p1: P1, p2: P2 }}
      touch={{ a: 'PUNCH', b: 'KICK', c: 'SUPER', vertical: true }}
      create={(env) => new FightSim(env)}
    />
  );
}
