/** Official Versus debates, created once. Pairs whose characters aren't in content/ are skipped. */
import type { VersusPrompt } from '~/lib/community';
import { createVersus } from './community';
import { getCharacter } from './content';
import type { Sql } from './db';

const OFFICIAL: [string, string, VersusPrompt][] = [
  ['batman', 'iron-man', 'brains'],
  ['joker', 'kilvish', 'villain'],
  ['shaktimaan', 'superman', 'legacy'],
  ['spider-man', 'nagraj', 'origin'],
  ['wolverine', 'doga', 'look'],
  ['thanos', 'darkseid', 'villain'],
  ['krrish', 'flash-barry-allen', 'rewatch'],
  ['wonder-woman', 'storm', 'team'],
  ['goku', 'saitama', 'rewatch'],
  ['super-commando-dhruva', 'batman', 'brains'],
  ['mogambo', 'lex-luthor', 'villain'],
  ['hellboy', 'spawn', 'look'],
  ['scarlet-witch', 'doctor-strange', 'comeback'],
  ['minnal-murali', 'invincible', 'origin'],
];

export async function seedIfEmpty(sql: Sql): Promise<void> {
  const any = await sql.get('SELECT 1 FROM versus WHERE official = 1 LIMIT 1');
  if (any) return;
  for (const [a, b, p] of OFFICIAL) {
    if (getCharacter(a) && getCharacter(b)) await createVersus(sql, a, b, p, null, true);
  }
}
