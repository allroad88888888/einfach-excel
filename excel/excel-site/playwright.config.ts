import { defineConfig, devices } from '@playwright/test'

/**
 * excel-site 构建产物冒烟(见 e2e/site-smoke/CASES.md)。
 *
 * 与 solid-excel 的 e2e 不同,这里测的是 `astro build` 的静态产物经
 * `astro preview` 提供的页面 —— 即部署到 GitHub Pages 的同一形态。dev
 * server 测不到构建期问题(island 打包、资产路径、base 前缀),而部署产物
 * 此前是零测试盲区("线上挂了"的观感故障没有任何门禁能拦)。
 *
 * 端口默认 4325,避开 astro dev 守护进程的 4321。CI(pages.yml)已单独
 * build 过,设 EINFACH_SITE_E2E_SKIP_BUILD=1 让 webServer 只跑 preview。
 */
const PORT = Number(process.env.EINFACH_SITE_E2E_PORT ?? 4325)
const BASE_URL = `http://127.0.0.1:${PORT}`
// 与 astro.config.mjs 的 base 逻辑保持一致(GitHub Pages 部署带仓库名前缀)。
export const SITE_BASE_PATH = process.env.GITHUB_ACTIONS === 'true' ? '/einfach-excel' : ''

// Playwright 的 webServer 探活遵循环境代理;本地代理会把 loopback 的 502/504
// 误判成"服务器已起"。与 solid-excel/playwright.config.ts 同一套防护。
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

const PREVIEW = `npx astro preview --host 127.0.0.1 --port ${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `${BASE_URL}${SITE_BASE_PATH}`,
    trace: 'on-first-retry',
  },
  webServer: {
    // build:api(typedoc)刻意跳过:demo 页不依赖 public/api-reference,
    // 冒烟只关心 demo 岛的构建产物形态。
    command:
      process.env.EINFACH_SITE_E2E_SKIP_BUILD === '1' ? PREVIEW : `npx astro build && ${PREVIEW}`,
    url: `${BASE_URL}${SITE_BASE_PATH}/`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
