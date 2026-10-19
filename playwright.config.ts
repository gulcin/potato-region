import { defineConfig } from 'playwright/test';

const viewports = [
  { name: 'ipad-11-portrait', width: 834, height: 1194 },
  { name: 'ipad-11-landscape', width: 1194, height: 834 },
  { name: 'ipad-13-portrait', width: 1032, height: 1376 },
  { name: 'ipad-13-landscape', width: 1376, height: 1032 },
  { name: 'iphone-portrait', width: 390, height: 844 },
];

export default defineConfig({
  testDir: 'tests',
  timeout: 480_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    actionTimeout: 15_000,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'VITE_FEEDBACK_URL=http://127.0.0.1:4173/potato-region/api/feedback npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    port: 4173,
    timeout: 180_000,
    reuseExistingServer: false,
  },
  projects: viewports.map((viewport) => ({
    name: viewport.name,
    use: {
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      deviceScaleFactor: 1,
      isMobile: viewport.name.startsWith('iphone'),
    },
  })),
});
