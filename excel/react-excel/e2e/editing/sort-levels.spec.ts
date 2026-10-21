import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const original = ['W20', 'E10', 'W10', 'E30']
async function expectRecords(page: Page, values: readonly string[]) {
  for (const [index, value] of values.entries())
    await expect(cell(page, `${25 + index}:2`)).toHaveText(value)
  await expect(cell(page, '24:0')).toHaveText('Team')
  await expect(cell(page, '24:1')).toHaveText('Score')
}
async function applyAndUndoOnce(page: Page, values: readonly string[]) {
  await button(page, 'Apply sort').click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expectRecords(page, values)
  await expect(page.getByRole('combobox', { name: 'Sort selected range' })).toBeFocused()
  await button(page, 'Undo').click(); await expectRecords(page, original)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click(); await expectRecords(page, values)
}

for (const width of [1280, 390]) test.describe(`${width}px sort levels`, () => {
  test.use({ viewport: { width, height: 850 } })
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'A25:C29', '24:0')
    await expectRecords(page, original)
    await page.getByRole('combobox', { name: 'Sort selected range' }).selectOption('custom')
    await page.getByLabel('First row is a header').check()
  })

  test(`add sort level changes tie ordering in one undo at ${width}px`, async ({ page }) => {
    await expect(page.getByLabel('Sort column 2')).toHaveCount(0)
    await button(page, 'Add level').click()
    await expect(page.getByLabel('Sort column 1')).toHaveValue('0')
    await expect(page.getByLabel('Sort column 2')).toHaveValue('1')
    await page.getByLabel('Sort order 2').selectOption('desc')
    await expect(page.getByLabel('Sort column 2').locator('option[value="0"]')).toBeDisabled()
    await applyAndUndoOnce(page, ['E30', 'E10', 'W20', 'W10'])
    await expect(cell(page, '25:2')).toHaveCSS('text-decoration-line', 'underline')
    await expect(cell(page, '26:2')).toHaveCSS('font-style', 'italic')
  })

  test(`remove sort level discards its key in one undo at ${width}px`, async ({ page }) => {
    await button(page, 'Add level').click()
    await page.getByLabel('Sort order 2').selectOption('desc')
    await button(page, 'Remove sort level 2').click()
    await expect(page.getByLabel('Sort column 2')).toHaveCount(0)
    await expect(page.getByLabel('Sort column 1')).toHaveValue('0')
    await expect(page.getByLabel('Sort order 1')).toHaveValue('asc')
    await expect(button(page, 'Remove sort level 1')).toBeDisabled()
    await applyAndUndoOnce(page, ['E10', 'E30', 'W20', 'W10'])
    await expect(cell(page, '25:2')).toHaveCSS('font-style', 'italic')
  })

  for (const direction of ['up', 'down'])
    test(`move sort level ${direction} changes priority in one undo at ${width}px`, async ({ page }) => {
      await button(page, 'Add level').click()
      await page.getByLabel('Sort order 2').selectOption('desc')
      const from = direction === 'up' ? 2 : 1
      await button(page, `Move sort level ${from} ${direction}`).click()
      await expect(page.getByLabel('Sort column 1')).toHaveValue('1')
      await expect(page.getByLabel('Sort order 1')).toHaveValue('desc')
      await expect(page.getByLabel('Sort column 2')).toHaveValue('0')
      await expect(page.getByLabel('Sort order 2')).toHaveValue('asc')
      await expect(page.getByLabel(`Sort column ${direction === 'up' ? 1 : 2}`)).toBeFocused()
      await applyAndUndoOnce(page, ['E30', 'W20', 'E10', 'W10'])
      await expect(cell(page, '25:2')).toHaveCSS('text-decoration-line', 'underline')
      await expect(cell(page, '26:2')).toHaveCSS('font-weight', '700')
    })
})
