import { defineConfig, devices } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:5173';
const matchOrigin = 'http://127.0.0.1:8787';
const baseURL = webOrigin + '/songen_wo_kakeyouka3/';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    {
      name: 'webkit',
      use: {
        ...devices['iPhone 17 Pro'],
        viewport: { width: 402, height: 874 },
        baseURL,
        trace: 'retain-on-failure',
      },
    },
  ],
  webServer: [
    {
      name: 'Match server',
      command: 'wrangler dev --local --env preview --env-file /dev/null --ip 127.0.0.1 --port 8787 --var ROOM_CODE_SECRET:browser-test-only-room-code-secret',
      env: { CLOUDFLARE_CF_FETCH_ENABLED: 'false', WRANGLER_SEND_METRICS: 'false' },
      url: matchOrigin + '/v1/health',
      timeout: 120_000,
    },
    {
      name: 'Built game',
      command: 'vite build && vite preview --host 127.0.0.1 --port 5173 --strictPort',
      env: { VITE_MATCH_SERVER_URL: matchOrigin },
      url: baseURL,
      timeout: 120_000,
    },
  ],
});
