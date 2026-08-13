import { defineConfig, devices } from '@playwright/test'
import { defineConfig as defineViteConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.EINFACH_E2E_PORT ?? 5182)
const BASE_URL = `http://127.0.0.1:${PORT}`

const noProxyEntries = new Set(
  `${process.env.NO_PROXY ?? ''},${process.env.no_proxy ?? ''}`
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
)
noProxyEntries.add('127.0.0.1')
noProxyEntries.add('localhost')
process.env.NO_PROXY = [...noProxyEntries].join(',')
process.env.no_proxy = process.env.NO_PROXY

function createFixtureViteConfig() {
  return defineViteConfig({
    resolve: {
      alias: {
        '@einfach/spreadsheet-ui-core': path.resolve(
          packageDirectory,
          '../spreadsheet-ui-core/src',
        ),
      },
    },
  })
}

/** Runs the controlled React adapter fixture in a real Chromium browser. */
const playwrightConfig = defineConfig({
  testDir: './e2e/adapter-selection',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: [
      'EINFACH_REACT_E2E_VITE_CONFIG=1',
      'vite e2e/fixture',
      '--config playwright.config.ts',
      '--host 127.0.0.1',
      `--port ${PORT}`,
      '--strictPort',
    ].join(' '),
    url: BASE_URL,
    reuseExistingServer: process.env.EINFACH_E2E_REUSE_SERVER === '1',
    timeout: 30_000,
  },
})

export default process.env.EINFACH_REACT_E2E_VITE_CONFIG === '1'
  ? createFixtureViteConfig()
  : playwrightConfig
