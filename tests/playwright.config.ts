import { defineConfig, devices } from '@playwright/test'

/**
 * Beacon — Playwright E2E configuration
 *
 * Usage:
 *   pnpm e2e              → run all tests headless
 *   pnpm e2e:ui           → open Playwright UI
 *   API_URL=https://... pnpm e2e  → target remote env
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const API_URL  = process.env.API_URL  ?? 'http://localhost:8000'

export default defineConfig({
  testDir:     './e2e',
  timeout:     60_000,
  retries:     process.env.CI ? 2 : 0,
  workers:     process.env.CI ? 1 : undefined,
  reporter:    process.env.CI ? 'github' : 'html',
  fullyParallel: false,

  use: {
    baseURL:       BASE_URL,
    trace:         'on-first-retry',
    screenshot:    'only-on-failure',
    video:         'retain-on-failure',
    extraHTTPHeaders: {
      'x-e2e-test': 'true',
    },
  },

  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
  ],
})

export { BASE_URL, API_URL }
