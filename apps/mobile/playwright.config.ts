import { defineConfig, devices } from '@playwright/test';

// Runs against the exported web build (pnpm build:web). Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a
// preinstalled Chromium instead of `playwright install chromium`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8090',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx expo serve --port 8090',
    url: 'http://localhost:8090',
    reuseExistingServer: !process.env.CI,
    env: { EXPO_OFFLINE: '1' },
  },
});
