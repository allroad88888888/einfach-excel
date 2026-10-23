import { defineConfig, devices } from '@playwright/test'
import { packageServer } from './playwright.package.config'

const port = Number(process.env.REACT_EXCEL_E2E_PORT ?? 5191)
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

/** Runs react-excel against its real Vite worker and Rust/WASM workbook. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // 文件之间并行；文件内仍顺序执行，保留现有模块级 fixture 的语义。
  workers: process.env.CI ? 1 : 2,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    // 本地不重试，也要保留首次失败的请求与浏览器事件。
    trace: 'retain-on-failure',
  },
  webServer: [{
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env.REACT_EXCEL_E2E_REUSE_SERVER === '1',
    timeout: 30_000,
  }, packageServer],
})
