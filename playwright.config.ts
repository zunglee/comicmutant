import { defineConfig, devices } from '@playwright/test';

// Builds, then serves the production bundle on its own port against a throwaway database.
const PORT = 4345;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && node scripts/e2e-server.mjs',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
