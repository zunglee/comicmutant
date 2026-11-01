/** The share grid from the server: 10 cells, ✓ ✗ or ⏱. */
const CELL = { '✓': 'ok', '✗': 'bad', '⏱': 'time' } as const;
export type CellKind = (typeof CELL)[keyof typeof CELL];

export function parseGrid(grid: string): CellKind[] {
  return (grid.match(/[✓✗⏱]/gu) ?? []).map((c) => CELL[c as keyof typeof CELL]);
}
