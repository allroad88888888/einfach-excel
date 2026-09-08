import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function edit(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await page.locator('[data-workbook-grid]').press('F2')
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill(value)
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
}
async function undo(page: Page) {
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
}
async function redo(page: Page) {
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('input undo/redo recalculates cross-sheet formulas without switching the view', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await edit(page, 'E2', '1:4', '10')
  await expect(cell(page, '1:6')).toHaveText('790')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('790')
  await undo(page)
  await expect(cell(page, '0:1')).toHaveText('79')
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await redo(page)
  await expect(cell(page, '0:1')).toHaveText('790')
})

test('grid shortcuts undo and redo while an active editor keeps its own draft', async ({
  page,
}) => {
  await edit(page, 'B3', '2:1', 'First edit')
  await expect(cell(page, '2:1')).toHaveText('First edit')
  const grid = page.locator('[data-workbook-grid]')
  await grid.press('Meta+z')
  await expect(cell(page, '2:1')).toHaveText('Northwind')
  await grid.press('Meta+Shift+z')
  await expect(cell(page, '2:1')).toHaveText('First edit')
  await grid.press('Control+z')
  await expect(cell(page, '2:1')).toHaveText('Northwind')
  await grid.press('Control+y')
  await expect(cell(page, '2:1')).toHaveText('First edit')
  await select(page, 'B3', '2:1')
  await grid.press('F2')
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toBeFocused()
  await editor.pressSequentially(' draft')
  await editor.press('Control+z')
  await expect(editor).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await editor.press('Escape')
  await expect(cell(page, '2:1')).toHaveText('First edit')
})

test('font-size undo restores row geometry and redo restores the native format', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  // I3 的原始换行文本已撑高第 3 行；撤销必须恢复原始行高。
  const originalHeight = (await cell(page, '2:1').boundingBox())!.height
  await page.getByRole('combobox', { name: 'Font size' }).selectOption('36')
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '36px')
  await expect.poll(async () => (await cell(page, '2:1').boundingBox())!.height).toBeGreaterThan(36)
  await undo(page)
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '12px')
  await expect
    .poll(async () => (await cell(page, '2:1').boundingBox())!.height)
    .toBe(originalHeight)
  await redo(page)
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '36px')
})

test('copy preserves history and paste adds one undoable operation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await edit(page, 'B3', '2:1', 'Copy me')
  await select(page, 'B3', '2:1')
  await copy(page)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled()
  await select(page, 'B4', '3:1')
  await paste(page)
  await expect(cell(page, '3:1')).toHaveText('Copy me')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Recent operations', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('2 undo · 0 redo')
  await expect(page.getByRole('dialog')).toContainText('Paste cells')
  await page.getByRole('button', { name: 'Close history' }).click()
  await undo(page)
  await expect(cell(page, '3:1')).toHaveText('Contoso')
  await expect(await select(page, 'B3', '2:1')).toHaveText('Copy me')
})

test('history list has counts, native addresses and usable desktop/narrow focus', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await edit(page, 'B3', '2:1', 'History example')
  await undo(page)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.getByRole('button', { name: 'Recent operations', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Recent operations' })
    await expect(dialog).toHaveText(/0 undo · 1 redo/)
    await expect(dialog.getByRole('listitem')).toHaveText(/Sales Orders · B3:B3 · Undone/)
    await expect(page.getByRole('button', { name: 'Close history' })).toBeFocused()
    await expect(dialog).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`history-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Recent operations', exact: true })).toBeFocused()
  }
  expect(errors).toEqual([])
})
