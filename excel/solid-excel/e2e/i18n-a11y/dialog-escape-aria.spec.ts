import { expect, test, type Page } from '@playwright/test'

import { cellDisplay, expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * 对话框 Escape 关闭 + aria 标签存在性抽查。
 *
 * 每个 vNext 对话框都注册 document 级 Escape keydown 处理器（find-replace
 * / format-cells / go-to / name-manager 各自的 createEffect），无论焦点在
 * 对话框内还是格子上都必须能关。焦点陷阱不在本 spec 范围：这些对话框是非模态
 * 的（Excel 语义），产品未实现 trap —— 见 CASES.md IA-16 的登记与例外
 * 说明。
 *
 * axe 门禁（a11y-surfaces.spec.ts）扫的是打开态的整个页面；这里补的是它
 * 覆盖不到的行为断言：Escape 语义、Go To 的打开即聚焦、以及工具栏按钮
 * aria-label 全量非空（axe 只报缺 accessible name 的按钮，不报空字符串
 * 以外的回归组合）。
 */

async function gotoWave5(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

test.describe('对话框 Escape 关闭 + aria 抽查', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Escape 关闭 find-replace 对话框（wave5）', async ({ page }) => {
    await gotoWave5(page)

    await page.getByTestId('toolbar-btn-find-replace').click()
    const dialog = page.getByTestId('wave5-find-replace')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('role', 'dialog')

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('Escape 关闭 Format Cells 对话框（wave5）', async ({ page }) => {
    await gotoWave5(page)

    await page.locator('[data-testid="wave5-grid"]').locator('td.cell[data-cell-addr="B2"]').click()
    await page.getByTestId('toolbar-btn-number-format').click()
    await expect(page.getByTestId('number-format-dropdown')).toBeVisible()
    await page.getByTestId('number-format-item-Custom').click()

    const dialog = page.getByTestId('wave5-format-cells')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('role', 'dialog')

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('Go To：打开即聚焦输入框，Escape 关闭（worker demo）', async ({ page }) => {
    await gotoWorkerDemo(page)

    await page.getByTestId('menu-bar-button-edit').click()
    await expect(page.getByTestId('menu-bar-dropdown-edit')).toBeVisible()
    await page.getByTestId('menu-bar-item-edit.goTo').click()

    const dialog = page.getByTestId('vnext-worker-go-to')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('role', 'dialog')
    // 打开即聚焦：键盘用户不需要先 Tab 进对话框（SpreadsheetGoToDialog 的
    // queueMicrotask focus）。
    await expect(page.getByTestId('go-to-input')).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('Escape 关闭 Name Manager（worker demo）', async ({ page }) => {
    await gotoWorkerDemo(page)

    await page.getByTestId('toolbar-btn-name-manager').click()
    const dialog = page.getByTestId('vnext-worker-name-manager')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('wave5 工具栏全部 toolbar-btn-* 按钮具备非空 aria-label', async ({ page }) => {
    await gotoWave5(page)

    const buttons = page.locator('button[data-testid^="toolbar-btn-"]')
    const count = await buttons.count()
    // 工具栏登记按钮量级在 30+；下限护栏防止 selector 失配时空转通过。
    expect(count).toBeGreaterThanOrEqual(20)

    const missing: string[] = []
    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i)
      const label = await button.getAttribute('aria-label')
      if (label === null || label.trim().length === 0) {
        missing.push((await button.getAttribute('data-testid')) ?? `#${i}`)
      }
    }
    expect(missing, `缺 aria-label 的工具栏按钮: ${missing.join(', ')}`).toEqual([])
  })
})
