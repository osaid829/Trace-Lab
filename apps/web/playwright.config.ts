import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: [
    { command: 'rm -f ../../.data/e2e.sqlite ../../.data/e2e.sqlite-wal ../../.data/e2e.sqlite-shm && TRACELAB_ALLOW_PRIVATE_TARGETS=true TRACELAB_DATABASE_PATH=./.data/e2e.sqlite npm run dev --workspace @tracelab/server', url: 'http://127.0.0.1:4310/healthz', reuseExistingServer: false },
    { command: 'node ../../scripts/e2e-target.mjs', url: 'http://127.0.0.1:4320/ok', reuseExistingServer: true },
    { command: 'npm run dev --workspace @tracelab/web', url: 'http://127.0.0.1:5173', reuseExistingServer: true }
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
