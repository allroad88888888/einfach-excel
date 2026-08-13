import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureDirectory = path.join(packageDirectory, 'e2e/adapter-selection/fixture')
const spreadsheetUiCoreSource = path.join(packageDirectory, '../spreadsheet-ui-core/src/index.ts')
const port = Number(process.env.EINFACH_E2E_PORT ?? 5183)
const baseURL = `http://127.0.0.1:${port}`
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

function createViteCommand(): string {
  const source =
    "import { createServer } from 'vite'; " +
    `const server = await createServer({ root: ${JSON.stringify(fixtureDirectory)}, ` +
    `server: { host: '127.0.0.1', port: ${port}, strictPort: true }, ` +
    `resolve: { alias: { '@einfach/spreadsheet-ui-core': ${JSON.stringify(spreadsheetUiCoreSource)} } } }); ` +
    'await server.listen()'

  return `node --input-type=module --eval ${JSON.stringify(source)}`
}

/** Runs the Vue adapter's local fixture in a single Chromium browser. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: createViteCommand(),
    url: baseURL,
    reuseExistingServer: process.env.EINFACH_E2E_REUSE_SERVER === '1',
    timeout: 30_000,
  },
})
