import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, address: string) => page.locator(`td[data-cell="${address}"]`)
const calendar = (page: Page) => page.getByLabel('Choose date', { exact: true })

async function editDateCell(page: Page) {
  await page.goto('/?plugins=date-picker')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name box' }).fill('A20')
  await page.getByRole('textbox', { name: 'Name box' }).press('Enter')
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
  await cell(page, '19:0').dblclick()
  await expect(calendar(page)).toBeVisible()
}

test('keyboard users reach the calendar with Alt+Down from the cell editor', async ({ page }) => {
  await editDateCell(page)
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toBeFocused()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(calendar(page)).toBeFocused()
  await expect(calendar(page)).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowDown')
  // 第一次 Esc 可能只关闭原生日历弹层；连续 Esc 后编辑取消、单元格不变。
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(calendar(page)).toHaveCount(0)
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Enter in the calendar uses the date and returns focus to the grid', async ({ page }) => {
  await editDateCell(page)
  await calendar(page).focus()
  await calendar(page).fill('2024-04-02')
  await calendar(page).press('Enter')
  await expect(cell(page, '19:0')).toHaveText('2024-04-02')
  await expect(calendar(page)).toHaveCount(0)
  await expect(page.locator('[data-workbook-grid]')).toBeFocused()
  await button(page, 'Undo').click()
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
})
