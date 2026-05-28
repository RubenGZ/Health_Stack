import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env from the e2e directory
dotenv.config({ path: path.resolve(__dirname, '.env') })

const DESKTOP_BASE = process.env.DESKTOP_BASE_URL ?? 'http://localhost:3000'
const MOBILE_BASE  = process.env.MOBILE_BASE_URL  ?? 'http://localhost:5175'

export default defineConfig({
  testDir: './tests',
  /* Run tests in sequence — avoids race conditions on shared test user */
  fullyParallel: false,
  /* Fail the suite in CI if test.only() is left in */
  forbidOnly: !!process.env.CI,
  /* Retry flaky tests once in CI */
  retries: process.env.CI ? 1 : 0,
  /* Limit parallelism: 1 worker in CI, 2 locally */
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    /* Capture screenshots + traces on first failure */
    screenshot: 'only-on-failure',
    trace:      'on-first-retry',
    video:      'on-first-retry',
    /* All API calls use the local backend */
    extraHTTPHeaders: { 'Accept': 'application/json' },
  },

  projects: [
    /* ── Desktop (vanilla JS SPA, port 3000) ── */
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: DESKTOP_BASE,
        viewport: { width: 1440, height: 900 },
      },
      testMatch: '**/desktop/**/*.spec.ts',
    },

    /* ── Mobile PWA (React/Vite, port 5175) ── */
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        baseURL: MOBILE_BASE,
        /* In prod the app lives at /mobile/, in dev at / */
        viewport: { width: 393, height: 851 },
        hasTouch: true,
        isMobile:  true,
      },
      testMatch: '**/mobile/**/*.spec.ts',
    },
  ],
})
