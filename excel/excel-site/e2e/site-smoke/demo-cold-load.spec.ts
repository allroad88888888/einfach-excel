import { expect, test, type Page } from '@playwright/test'

/**
 * 部署产物冒烟:每个 Solid demo 页在预算时间内出真格子。
 *
 * 这条门禁拦的是"看起来挂了"级别的观感故障 —— island 水合失败、worker/
 * WASM 资产路径断裂、seed 卡死。React/Vue 的受控投影 demo 不在此覆盖
 * (各自的 e2e 包负责,矩阵见 docs/FRAMEWORK_BACKEND_E2E_MATRIX.md)。
 */

/** worker + 10 万行 seed 的 demo 给宽预算;其余(静态/小 seed)从严。 */
const DEMOS: Array<{ id: string; budgetMs: number; expectProgress?: boolean }> = [
  { id: 'workbench', budgetMs: 15_000 },
  { id: 'formula-engine', budgetMs: 15_000 },
  { id: 'custom-formulas', budgetMs: 15_000 },
  { id: 'viewport-projection', budgetMs: 45_000, expectProgress: true },
  { id: 'lazy-formulas', budgetMs: 45_000, expectProgress: true },
  { id: 'lazy-area', budgetMs: 45_000, expectProgress: true },
  { id: 'clean-messy-data', budgetMs: 15_000 },
  { id: 'hand-off-a-form', budgetMs: 15_000 },
  { id: 'bring-your-own-backend', budgetMs: 15_000 },
  { id: 'collaboration', budgetMs: 15_000 },
]

async function expectGridReady(page: Page, budgetMs: number) {
  const grid = page.getByTestId('spreadsheet-grid')
  await expect(grid).toBeVisible({ timeout: budgetMs })
  await expect(grid.locator('td.cell').first()).toBeVisible({ timeout: 5_000 })
  // 工作簿生命周期不得停在 failed(feedback surface 只在异常态渲染错误)。
  await expect(page.locator('[data-testid="workbook-recovery-feedback"][data-state="error"]')).toHaveCount(0)
}

test.describe('deployed-artifact smoke — every demo shows real cells in budget', () => {
  for (const demo of DEMOS) {
    test(`/demos/${demo.id}/ renders the grid within ${demo.budgetMs / 1000}s`, async ({
      page,
    }) => {
      await page.goto(`/demos/${demo.id}/`)
      await expectGridReady(page, demo.budgetMs)
      if (demo.expectProgress) {
        // 大 seed 导入完成后进度条必须卸载(不残留在 ready 页面上)。
        await expect(page.getByTestId('demo-import-progress')).toHaveCount(0)
      }
    })
  }

  test('the zh workbench page serves the same island', async ({ page }) => {
    await page.goto('/zh/demos/workbench/')
    await expectGridReady(page, 15_000)
  })

  test('the homepage hero island reaches ready with its import progress gone', async ({
    page,
  }) => {
    await page.goto('/')
    await expectGridReady(page, 45_000)
    await expect(page.getByTestId('demo-import-progress')).toHaveCount(0)
  })
})
