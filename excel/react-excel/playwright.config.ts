import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { findDevServerSpecs } from './playwright.dev-specs'
import { packageServer } from './playwright.package.config'

const port = Number(process.env.REACT_EXCEL_E2E_PORT ?? 5191)
const devURL = `http://127.0.0.1:${port}`
const buildPort = Number(process.env.REACT_EXCEL_E2E_BUILD_PORT ?? 5192)
const buildURL = `http://127.0.0.1:${buildPort}`
const reuseExistingServer = process.env.REACT_EXCEL_E2E_REUSE_SERVER === '1'
const devServerSpecs = findDevServerSpecs(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'e2e'))
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

/**
 * Runs react-excel against its real Worker and Rust/WASM workbook. The `build`
 * project serves the production bundle (`vite.e2e.config.ts`), so tree-shaking
 * and CSS extraction are covered; specs that import dev-server URLs stay on `dev`.
 */
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
    // 本地不重试，也要保留首次失败的请求与浏览器事件。
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'build', testIgnore: devServerSpecs, use: { baseURL: buildURL } },
    { name: 'dev', testMatch: devServerSpecs, use: { baseURL: devURL } },
  ],
  webServer: [{
    // 继承 vite.config 需要无扩展名导入；本仓 tsconfig 不允许 .ts 导入扩展名。
    command: 'VITE_CONFIG_NATIVE_IGNORE_WARNING=true pnpm exec vite build --config vite.e2e.config.ts --logLevel warn && '
      + `pnpm exec vite preview --config vite.e2e.config.ts --host 127.0.0.1 --port ${buildPort} --strictPort`,
    url: buildURL,
    reuseExistingServer,
    timeout: 120_000,
  }, {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: devURL,
    reuseExistingServer,
    timeout: 30_000,
  }, packageServer],
})
