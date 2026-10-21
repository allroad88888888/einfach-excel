import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const merged = (page: Page, coord = '1:1') =>
  page.locator(`[data-merged-cell][data-cell="${coord}"]`)
const menu = (page: Page) => page.getByRole('combobox', { name: 'Merge cells', exact: true })
async function merge(page: Page, action = 'merge') {
  await menu(page).selectOption(action)
  if (action !== 'unmerge') {
    const dialog = page.getByRole('alertdialog', { name: 'Merge these cells?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Merge cells', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  await expect(menu(page)).toBeEnabled()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const width of [1280, 390]) test(`unmerge preserves the seeded anchor and other merges at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A15', '14:0')
  const target = merged(page, '14:0')
  const other = merged(page, '16:0')
  await expect(target).toHaveText('Merged heading')
  await expect(other).toHaveText('Two-row merged cell')
  await merge(page, 'unmerge')
  await expect(target).toHaveCount(0)
  await expect(page.locator('td[data-cell="14:0"]')).toHaveText('Merged heading')
  await expect(page.locator('td[data-cell="14:0"]')).toHaveCSS('text-align', 'center')
  await expect(page.locator('td[data-cell="14:1"]')).toHaveText('')
  await expect(other).toHaveText('Two-row merged cell')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target).toHaveText('Merged heading')
  await expect(target).toHaveAttribute('aria-colspan', '4')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(target).toHaveCount(0)
  await expect(other).toHaveText('Two-row merged cell')
})

test('confirmed merge keeps its anchor and restores discarded values in one undo', async ({
  page,
}) => {
  await select(page, 'B2:C3', '1:1')
  const outside = await page.locator('td[data-cell="1:3"]').innerText()
  await merge(page)
  await expect(merged(page)).toHaveText('Acme Co.')
  await expect(merged(page)).toHaveAttribute('aria-rowspan', '2')
  await expect(merged(page)).toHaveAttribute('aria-colspan', '2')
  await expect(page.locator('td[data-cell="1:3"]')).toHaveText(outside)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(merged(page)).toHaveCount(0)
  await expect(page.locator('td[data-cell="1:2"]')).toHaveText('North')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(merged(page)).toHaveText('Acme Co.')
})

for (const width of [1280, 390]) test(`cancel merge keeps every selected value and adds no history at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await select(page, 'B2:C3', '1:1')
  const coords = ['1:1', '1:2', '2:1', '2:2', '1:3']
  const before = await Promise.all(coords.map(coord => page.locator(`td[data-cell="${coord}"]`).innerText()))
  await menu(page).selectOption('merge')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(merged(page)).toHaveCount(0)
  for (const [index, coord] of coords.entries())
    await expect(page.locator(`td[data-cell="${coord}"]`)).toHaveText(before[index]!)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect(menu(page)).toBeEnabled()
})

test('merge and center has one outer frame and both editors use its anchor', async ({ page }) => {
  await select(page, 'B2:C3', '1:1')
  await merge(page, 'center')
  await expect(merged(page)).toHaveCSS('text-align', 'center')
  await merged(page).dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toHaveValue('Acme Co.')
  const box = await merged(page).boundingBox()
  const input = await editor.boundingBox()
  expect(input!.width).toBeCloseTo(box!.width, 0)
  expect(input!.height).toBeCloseTo(box!.height, 0)
  await editor.fill('Merged edit')
  await editor.press('Enter')
  await expect(merged(page)).toHaveText('Merged edit')
  await merged(page).click()
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await expect(formula).toHaveValue('Merged edit')
  await formula.fill('From formula bar')
  await formula.press('Enter')
  await expect(merged(page)).toHaveText('From formula bar')
  await page.locator('td[data-cell="4:1"]').dblclick()
  await expect(editor).toBeVisible()
  await editor.fill('Next cell')
  await editor.press('Enter')
  await expect(page.locator('td[data-cell="4:1"]')).toHaveText('Next cell')
})

test('arrow, Tab and Enter leave the whole merged rectangle in one step', async ({ page }) => {
  await select(page, 'B2:C3', '1:1')
  await merge(page)
  for (const [key, target] of [
    ['ArrowRight', 'D2'],
    ['ArrowDown', 'B4'],
    ['Tab', 'D2'],
    ['Enter', 'B4'],
  ]) {
    await merged(page).click()
    await page.locator('[data-workbook-grid]').press(key)
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(target)
  }
})

test('scrolling through a large merge keeps its full geometry and offscreen source', async ({
  page,
}) => {
  await select(page, 'B2:E80', '1:1')
  await merge(page)
  await page.getByTestId('sheet-scroll').evaluate((element) => {
    element.scrollTop = 900
  })
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
  await expect(merged(page)).toBeVisible()
  await expect(merged(page)).toHaveAttribute('aria-rowspan', '79')
  await merged(page).click({ position: { x: 12, y: 1100 } })
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('Acme Co.')
})

test('merge menu and confirmation fit desktop and narrow screens', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
    await select(page, 'B2:C3', '1:1')
    await menu(page).scrollIntoViewIfNeeded()
    await menu(page).selectOption('center')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    )
    await page.screenshot({ path: info.outputPath(`merge-confirm-${width}.png`), fullPage: true })
    await dialog.getByRole('button', { name: 'Merge cells', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(merged(page)).toHaveCSS('text-align', 'center')
    await page.screenshot({ path: info.outputPath(`merge-result-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})

test('a merged cell remains editable when its anchor row and column are hidden', async ({
  page,
}) => {
  await select(page, 'B2:C3', '1:1')
  await merge(page)
  const visibility = page.getByRole('combobox', { name: 'Row and column visibility' })
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await visibility.selectOption('hide-rows')
  await expect(visibility).toBeEnabled()
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await visibility.selectOption('hide-columns')
  await expect(visibility).toBeEnabled()
  await expect(merged(page)).toBeVisible()
  await merged(page).dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toHaveValue('Acme Co.')
  await editor.fill('Visible merged edit')
  await editor.press('Enter')
  await expect(merged(page)).toHaveText('Visible merged edit')
})
