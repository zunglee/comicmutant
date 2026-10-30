import { GameShell } from '../shell/GameShell';
import type { GameProps } from '../types';
import { BadmintonSim } from './sim';

const P1 = [
  { keys: 'A / D · W', does: 'Move · jump (jump + F = smash)' },
  { keys: 'F · G', does: 'Swing (clear / high serve) · Drop (drop / short serve)' },
  { keys: 'D / A + swing', does: 'Aim tight / deep' },
];
const P2 = [
  { keys: '← / → · ↑', does: 'Move · jump (jump + J = smash)' },
  { keys: 'J · K', does: 'Swing (clear / high serve) · Drop (drop / short serve)' },
  { keys: '← / → + swing', does: 'Aim tight / deep' },
];

export default function BadmintonGame(props: GameProps) {
  return (
    <GameShell
      {...props}
      game="badminton"
      blurb="Rally scoring. Run them short, then deep: a stretched opponent cracks."
      controls={{ p1: P1, p2: P2 }}
      touch={{ a: 'Swing', b: 'Drop' }}
      startOptions={[
        {
          id: 'points',
          label: 'Match',
          choices: [
            { value: '7', label: 'First to 7' },
            { value: '11', label: 'Long: 11' },
          ],
        },
      ]}
      create={(env) => new BadmintonSim(env)}
    />
  );
}
