import { expect, test, type Page } from '@playwright/test'

import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * 状态栏聚合随选区变化 + Name Box 回显/提交/报错。
 *
 * 跑在 Wave 5 静态 host 上：数据由 `VNextWave5Demo.tsx` 的 matrix 固定给定，
 * 聚合值可做精确断言（B2=120, C2=180, B3=80, C3=160）。静态后端无 worker
 * 差异，wasm/ts 两个 project 行为一致，不做 project 分支。
 *
 * 断言口径与 vnext-status-bar-real-backend.spec.ts 保持一致：
 *   - 聚合值 testid `status-aggregate-<key>-value`，纯数字文本。
 *   - 选区地址 testid `status-selection`（A1 区间字符串）。
 *   - Name Box display 由 `nameBoxDisplayAtom` 驱动：单格显示活动单元格地址，
 *     多格显示 range A1 地址（spreadsheet-ui-core/src/name-box/index.ts）。
 */

async function gotoWave5(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

function cell(page: Page, addr: string) {
  return page.locator('[data-testid="wave5-grid"]').locator(`td.cell[data-cell-addr="${addr}"]`)
}

async function expectAggregate(page: Page, key: string, value: string) {
  await expect(page.getByTestId(`status-aggregate-${key}-value`)).toHaveText(value)
}

test.describe('状态栏聚合 + Name Box（wave5 静态 host）', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Name Box 回显 shift-click 范围地址并在单击后回落单格', async ({ page }) => {
    await gotoWave5(page)
    const nameBox = page.getByTestId('name-box-input')

    await cell(page, 'B2').click()
    await expect(nameBox).toHaveValue('B2')

    await cell(page, 'D3').click({ modifiers: ['Shift'] })
    await expect(nameBox).toHaveValue('B2:D3')

    await cell(page, 'C5').click()
    await expect(nameBox).toHaveValue('C5')
  })

  test('Name Box 提交范围地址驱动选区与状态栏精确聚合', async ({ page }) => {
    await gotoWave5(page)
    const nameBox = page.getByTestId('name-box-input')

    await nameBox.click()
    await nameBox.fill('B2:C3')
    await nameBox.press('Enter')

    await expect(page.getByTestId('status-selection')).toHaveText('B2:C3')
    // B2=120, C2=180, B3=80, C3=160 → sum 540, avg 135, count 4。
    await expectAggregate(page, 'sum', '540')
    await expectAggregate(page, 'average', '135')
    await expectAggregate(page, 'count', '4')
    await expect(page.getByTestId('status-aggregates')).toHaveAttribute('data-truncated', 'false')
  })

  test('状态栏聚合随选区扩展/收缩重算', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await cell(page, 'C2').click({ modifiers: ['Shift'] })
    await expectAggregate(page, 'sum', '300')
    await expectAggregate(page, 'count', '2')

    // Shift 扩展到 C3：聚合必须立即重算，而不是保留旧选区的值。
    await cell(page, 'C3').click({ modifiers: ['Shift'] })
    await expectAggregate(page, 'sum', '540')
    await expectAggregate(page, 'average', '135')
    await expectAggregate(page, 'count', '4')

    // 收缩回单格：不残留多格聚合。
    await cell(page, 'B2').click()
    await expectAggregate(page, 'sum', '120')
    await expectAggregate(page, 'count', '1')
  })

  test('Name Box 非法输入报错且选区不动', async ({ page }) => {
    await gotoWave5(page)
    const nameBox = page.getByTestId('name-box-input')

    await cell(page, 'B3').click()
    await expect(page.getByTestId('status-active-cell')).toHaveText('B3')

    // "!!!" 既非 A1 地址也非合法名称 → classifyNameBoxInput 判 invalid。
    await nameBox.click()
    await nameBox.fill('!!!')
    await nameBox.press('Enter')

    const errorMessage = page.getByTestId('name-box-error')
    await expect(errorMessage).toBeVisible()
    await expect(page.getByTestId('name-box')).toHaveAttribute('data-error', 'true')
    await expect(page.getByTestId('status-active-cell')).toHaveText('B3')

    // 合法地址提交：错误清除，选区跳转。
    await nameBox.click()
    await nameBox.fill('A1')
    await nameBox.press('Enter')
    await expect(errorMessage).toHaveCount(0)
    await expect(page.getByTestId('name-box')).toHaveAttribute('data-error', 'false')
    await expect(page.getByTestId('status-active-cell')).toHaveText('A1')
  })
})
