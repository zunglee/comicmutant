/** Production build served against a throwaway database, for Playwright. Never touches data/. */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve('test-results/e2e-data');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const port = process.env.PORT ?? '4345';
const child = spawn(
  path.resolve('node_modules/.bin/react-router-serve'),
  ['./build/server/index.js'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port,
      HOST: 'localhost',
      COMICMUTANT_DB: path.join(dir, 'e2e.db'),
      COMICMUTANT_LAB: '1',
      COMICMUTANT_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only',
      COMICMUTANT_IP_HEADER: 'none',
      COMICMUTANT_ORIGIN: `http://localhost:${port}`,
    },
  },
);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
