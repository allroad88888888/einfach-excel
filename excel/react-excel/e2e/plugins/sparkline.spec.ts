import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const sparklines = (page: Page) => page.locator('.drawing-cell[data-drawing-kind="sparkline"]')

async function typeRow(page: Page, row: number, values: readonly string[]) {
  await cell(page, `${row}:0`).click()
  for (const value of values) {
    await page.keyboard.type(value)
    await page.keyboard.press('Tab')
  }
  await page.keyboard.press('Enter')
}

async function seed(page: Page) {
  await page.goto('/?plugins=sparkline')
  await expect(cell(page, '1:0')).toBeVisible()
  // 演示表的列带文本格式；在新建的空白表上录数。
  await button(page, 'New sheet').click()
  await expect(cell(page, '0:1')).toHaveText('')
  await typeRow(page, 0, ['1', '3', '2', '5'])
  await typeRow(page, 1, ['4', '-2', '1', '0'])
  await cell(page, '0:0').click()
  await cell(page, '1:3').click({ modifiers: ['Shift'] })
}

test('creating line sparklines draws one per row in the location cells and follows edits', async ({ page }) => {
  await seed(page)
  await button(page, 'Create sparklines: Line').click()
  const dialog = page.getByRole('dialog', { name: /Create sparklines/ })
  await expect(dialog.getByLabel('Data range')).toHaveValue('A1:D2')
  await dialog.getByLabel('Location range').fill('F1:F3')
  await button(page, 'OK').click()
  await expect(dialog.getByRole('alert')).toContainText('does not match')
  await dialog.getByLabel('Location range').fill('F1:F2')
  await button(page, 'OK').click()
  await expect(dialog).toHaveCount(0)
  await expect(sparklines(page)).toHaveCount(1)
  // 一组一个格内对象，覆盖 F1:F2，每格一条折线。
  const box = await sparklines(page).boundingBox()
  const f1 = await cell(page, '0:5').boundingBox()
  const f2 = await cell(page, '1:5').boundingBox()
  expect(Math.abs(box!.x - f1!.x)).toBeLessThan(2)
  expect(Math.abs(box!.y + box!.height - (f2!.y + f2!.height))).toBeLessThan(2)
  await expect(sparklines(page).locator('[data-sparkline-cell="0:5"] polyline')).toHaveCount(1)
  const before = await sparklines(page).locator('[data-sparkline-cell="0:5"] polyline').getAttribute('points')
  await cell(page, '0:3').click()
  await page.keyboard.type('-4')
  await page.keyboard.press('Enter')
  await expect.poll(() => sparklines(page).locator('[data-sparkline-cell="0:5"] polyline')
    .getAttribute('points')).not.toBe(before)
  await button(page, 'Undo').click()
  await expect.poll(() => sparklines(page).locator('[data-sparkline-cell="0:5"] polyline')
    .getAttribute('points')).toBe(before)
})

test('selecting a sparkline cell offers its design options and clearing removes the group', async ({ page }) => {
  await seed(page)
  await button(page, 'Create sparklines: Column').click()
  await page.getByLabel('Location range').fill('F1:F2')
  await button(page, 'OK').click()
  await expect(sparklines(page).locator('rect')).not.toHaveCount(0)
  await expect(page.getByLabel('Sparkline type', { exact: true })).toHaveCount(0)
  await cell(page, '1:5').click()
  await page.getByLabel('Sparkline type', { exact: true }).selectOption('winLoss')
  await expect(sparklines(page).locator('svg')).toHaveAttribute('data-sparkline-type', 'winLoss')
  // 第二行 4, -2, 1, 0：零不画，三根柱。
  await expect(sparklines(page).locator('[data-sparkline-cell="1:5"] rect')).toHaveCount(3)
  const negative = page.getByLabel('Negative points', { exact: true })
  await negative.click()
  await expect(negative).toBeChecked()
  await expect(sparklines(page).locator('[data-sparkline-cell="1:5"] rect[fill="#D00000"]')).toHaveCount(1)
  await button(page, 'Clear sparklines').click()
  await expect(sparklines(page)).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(sparklines(page)).toHaveCount(1)
})
