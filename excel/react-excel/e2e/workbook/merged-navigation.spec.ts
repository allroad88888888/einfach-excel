import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const mergeCell = (page: Page, coord: string) =>
  page.locator(`[data-merged-cell][data-cell="${coord}"]`)
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
async function merge(page: Page, address: string, coord: string) {
  await select(page, address, coord)
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Merge cells', exact: true })
    .click()
  await expect(mergeCell(page, coord)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await merge(page, 'B2:C3', '1:1')
})

for (const [key, target] of [
  ['Enter', 'B4'],
  ['Shift+Enter', 'B1'],
  ['Tab', 'D2'],
  ['Shift+Tab', 'A2'],
]) {
  test(`editing a merged anchor then ${key} moves to ${target}`, async ({ page }) => {
    await mergeCell(page, '1:1').dblclick()
    const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
    await editor.fill(`Saved with ${key}`)
    await editor.press(key)
    await expect(editor).toHaveCount(0)
    await expect(mergeCell(page, '1:1')).toHaveText(`Saved with ${key}`)
    await expect(nameBox(page)).toHaveValue(target)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
  })
}

test('Shift arrows expand and shrink the whole merged selection in all four directions', async ({
  page,
}) => {
  for (const [out, back, range] of [
    ['ArrowRight', 'ArrowLeft', 'B2:D3'],
    ['ArrowLeft', 'ArrowRight', 'A2:C3'],
    ['ArrowDown', 'ArrowUp', 'B2:C4'],
    ['ArrowUp', 'ArrowDown', 'B1:C3'],
  ]) {
    await mergeCell(page, '1:1').click()
    await page.locator('[data-workbook-grid]').press(`Shift+${out}`)
    await expect(nameBox(page)).toHaveValue(range)
    await page.locator('[data-workbook-grid]').press(`Shift+${back}`)
    await expect(nameBox(page)).toHaveValue('B2:C3')
  }
})

test('adjacent merged cells are single navigation stops in both directions', async ({ page }) => {
  await merge(page, 'D2:E3', '1:3')
  await mergeCell(page, '1:1').click()
  const grid = page.locator('[data-workbook-grid]')
  for (const [key, address] of [
    ['ArrowRight', 'D2:E3'],
    ['ArrowRight', 'F2'],
    ['ArrowLeft', 'D2:E3'],
    ['ArrowLeft', 'B2:C3'],
    ['ArrowLeft', 'A2'],
  ]) {
    await grid.press(key)
    await expect(nameBox(page)).toHaveValue(address)
  }
})
