import { defineConfig, devices } from '@playwright/test'

export const packagePort = Number(process.env.REACT_EXCEL_PACKAGE_PORT ?? 5193)
export const packageURL = `http://127.0.0.1:${packagePort}`
export const packageServer = {
  command: 'node ../../scripts/serve-react-package-consumers.mjs',
  url: `${packageURL}/vite/`,
  reuseExistingServer: false,
  timeout: 30_000,
}
export default defineConfig({
  testDir: './e2e/package-host',
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: packageServer,
})
