import { defineConfig, devices } from '@playwright/test'

/** 仅测试侧诊断；不 prepare/build/pack，也不启动包消费者 server。 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/selection/statistics-actions.spec.ts', '**/workbook/table-dialog.spec.ts'],
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['json', { outputFile: process.env.INPUT_STALL_JSON }]],
  outputDir: process.env.INPUT_STALL_OUTPUT,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5191',
    trace: 'retain-on-failure',
    connectOptions: process.env.INPUT_STALL_WS ? {
      wsEndpoint: process.env.INPUT_STALL_WS,
    } : undefined,
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 5191 --strictPort',
    url: 'http://127.0.0.1:5191',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
