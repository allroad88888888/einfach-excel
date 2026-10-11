import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const menu = (page: Page) => page.getByRole('combobox', { name: 'Sort selected range' })
const original = ['M1', 'M2', 'M3', 'M4', 'P1', 'empty-a', 'empty-b']
async function records(page: Page, values: readonly string[]) {
  for (let index = 0; index < values.length; index++)
    await expect(cell(page, `${32 + index}:5`)).toHaveText(values[index]!)
}
async function open(page: Page) {
  await menu(page).selectOption('custom')
  await page.getByLabel('First row is a header').check()
}
async function apply(page: Page) {
  await button(page, 'Apply sort').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(menu(page)).toBeFocused()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'D32:F39', '31:3')
  await records(page, original)
})

for (const [caseSensitive, position, direction, expected] of [
  [false, 'last', 'asc', ['M4', 'M1', 'M2', 'M3', 'P1', 'empty-a', 'empty-b']],
  [true, 'last', 'asc', ['M4', 'M1', 'M2', 'P1', 'M3', 'empty-a', 'empty-b']],
  [true, 'first', 'asc', ['empty-a', 'empty-b', 'M4', 'M1', 'M2', 'P1', 'M3']],
  [true, 'first', 'desc', ['empty-a', 'empty-b', 'M3', 'P1', 'M1', 'M2', 'M4']],
] as const) test(`native seed sort case=${caseSensitive} empty=${position} order=${direction} is stable and undoable`,
  async ({ page }) => {
    await open(page)
    await page.getByLabel('Case sensitive', { exact: true }).setChecked(caseSensitive)
    await page.getByLabel('Empty cell position').selectOption(position)
    await page.getByLabel('Sort order 1').selectOption(direction)
    await apply(page); await records(page, expected)
    await expect(cell(page, '31:3')).toHaveText('Key')
    await expect(cell(page, `${32 + expected.indexOf('M1')}:5`)).toHaveCSS('font-style', 'italic')
    await expect(cell(page, `${32 + expected.indexOf('P1')}:5`)).toHaveCSS('text-decoration-line', 'underline')
    // 同选项再次排序为 no-op，不增加历史。
    await open(page)
    await page.getByLabel('Case sensitive', { exact: true }).setChecked(caseSensitive)
    await page.getByLabel('Empty cell position').selectOption(position)
    await page.getByLabel('Sort order 1').selectOption(direction)
    await apply(page)
    await expect(page.getByLabel('Sort status')).toHaveText('Already in order.')
    await button(page, 'Undo').click(); await records(page, original)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click(); await records(page, expected)
  })

test('moving a mixed-direction level changes priority and keeps keyboard focus on that level', async ({ page }) => {
  await select(page, 'A25:C29', '24:0'); await open(page)
  await button(page, 'Add level').click()
  await page.getByLabel('Sort order 2').selectOption('desc')
  await button(page, 'Move sort level 2 up').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Sort column 1')).toHaveValue('1')
  await expect(page.getByLabel('Sort order 1')).toHaveValue('desc')
  await expect(page.getByLabel('Sort column 1')).toBeFocused()
  await button(page, 'Move sort level 1 down').click()
  await expect(page.getByLabel('Sort column 2')).toBeFocused()
  await button(page, 'Move sort level 2 up').click()
  await apply(page)
  for (const [index, value] of ['E30', 'W20', 'E10', 'W10'].entries())
    await expect(cell(page, `${25 + index}:2`)).toHaveText(value)
  await button(page, 'Undo').click()
  await expect(cell(page, '25:2')).toHaveText('W20')
})

test('empty-first respects filtered slots, includes manual hidden rows and keeps native history', async ({ page }) => {
  await select(page, 'D33', '32:3')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-rows')
  await select(page, 'D32:F39', '31:3')
  await page.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  await button(page, 'Filter column F').click()
  await page.getByLabel('Filter condition 1').selectOption('list')
  await page.getByLabel('Filter value 1', { exact: true }).fill('M1\nM3\nempty-a\nempty-b')
  await button(page, 'Apply filter').click()
  await select(page, 'D32:F39', '31:3'); await open(page)
  await page.getByLabel('Empty cell position').selectOption('first')
  await apply(page)
  await expect(cell(page, '37:5')).toHaveText('M1')
  await expect(cell(page, '32:5')).toHaveCount(0)
  await expect(cell(page, '33:5')).toHaveCount(0)
  await button(page, 'Undo').click(); await expect(cell(page, '37:5')).toHaveText('empty-a')
  await button(page, 'Redo').click(); await expect(cell(page, '37:5')).toHaveText('M1')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
  await expect(cell(page, '32:5')).toHaveText('empty-a')
  await expect(cell(page, '33:5')).toHaveCount(0)
})

for (const width of [1280, 390]) test(`sort options and priority controls fit ${width}px; cancel does not write`,
  async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page); await button(page, 'Add level').click()
    await page.getByLabel('Case sensitive', { exact: true }).check()
    await page.getByLabel('Empty cell position').selectOption('first')
    await button(page, 'Move sort level 2 up').click()
    const dialog = page.getByRole('dialog')
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    await expect(button(page, 'Apply sort')).toBeInViewport()
    await page.screenshot({ path: `/tmp/excel-sort-options-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(menu(page)).toBeFocused()
    await expect(button(page, 'Undo')).toBeDisabled()
    await menu(page).selectOption('custom')
    await expect(page.getByLabel('Case sensitive', { exact: true })).not.toBeChecked()
    await expect(page.getByLabel('Empty cell position')).toHaveValue('last')
    await expect(page.getByLabel('Sort column 2')).toHaveCount(0)
    await button(page, 'Cancel').click()
    expect(errors).toEqual([])
  })
