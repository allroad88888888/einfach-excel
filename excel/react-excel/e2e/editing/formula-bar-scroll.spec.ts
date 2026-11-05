import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

/** 网格滚到远处并等投影落定；此时活动格已不在可见区投影里。 */
async function scrollFarDown(page: Page) {
  await page.locator('.sheet-scroll').evaluate((node) => { node.scrollTop = 6000 })
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
}

for (const width of [1280, 390]) {
  test(`formula bar keeps the active cell after it scrolls out of view at ${width}px`, async ({ page }) => {
    // 回归：活动格滚出可见区后公式栏清空并禁用、单格命令变灰，滚回来又恢复，看起来在闪。
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await select(page, 'B3', '2:1')
    const bar = page.getByRole('textbox', { name: 'Active cell value' })
    await expect(bar).toHaveValue('Northwind')
    await scrollFarDown(page)
    await expect(page.locator('td[data-cell="2:1"]')).toHaveCount(0)
    await expect(bar).toHaveValue('Northwind')
    await expect(bar).toBeEnabled()
    if (width === 1280) {
      await expect(page.getByRole('button', { name: 'Hyperlink', exact: true })).toBeEnabled()
    }
    await page.locator('.sheet-scroll').evaluate((node) => { node.scrollTop = 0 })
    await expect(page.locator('td[data-cell="2:1"]')).toHaveText('Northwind')
    await expect(bar).toHaveValue('Northwind')
  })
}

test('canvas formula bar keeps the active cell after it scrolls out of view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.goto('/?renderer=canvas')
  const bar = page.getByRole('textbox', { name: 'Active cell value' })
  const name = page.getByRole('textbox', { name: 'Name box' })
  await expect(bar).toHaveValue('Order')
  await name.fill('B3')
  await name.press('Enter')
  await expect(bar).toHaveValue('Northwind')
  await scrollFarDown(page)
  await expect(page.locator('canvas[data-row-start]')).not.toHaveAttribute('data-row-start', '0')
  await expect(bar).toHaveValue('Northwind')
  await expect(bar).toBeEnabled()
})
