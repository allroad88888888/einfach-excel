import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { setShrinkColumnWidth } from '../support/shrink-to-fit'
import { openDateFile as openFile } from '../support/conditional-dates'
import { diagonalCell as cell, diagonalWorkbook, openDiagonal, applyDiagonal,
  expectDiagonalGeometry } from '../support/diagonal-borders'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, diagonalWorkbook)
})

test('diagonals follow resized columns and zoom while preserving row height and source text', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await openDiagonal(page, 'diagonal-down'); await applyDiagonal(page)
  for (const width of [60, 210]) {
    await setShrinkColumnWidth(page, width)
    await expect(cell(page, '1:1').locator('svg')).toHaveAttribute('width', String(width))
    for (const zoom of ['70', '150', '200']) {
      await page.getByRole('slider', { name: 'Zoom level' }).fill(zoom)
      await expectDiagonalGeometry(cell(page, '1:1'), ['diagDown'])
      await expect(cell(page, '1:1').locator('svg')).toHaveAttribute('height', '48')
      await expect(cell(page, '1:1')).toHaveText('B2 kept')
    }
  }
})

test('a merged diagonal retains full endpoints across four frozen fragments and scroll', async ({ page }, info) => {
  await select(page, 'E5:G6', '4:4')
  await openDiagonal(page, 'diagonal', 'double'); await applyDiagonal(page)
  const merged = page.locator('[data-merged-cell][data-cell="4:4"]')
  await expectDiagonalGeometry(merged, ['diagDown', 'diagUp'], 2)
  const original = await merged.locator('svg').getAttribute('viewBox')
  await showRibbonItem(page, 'data.merge-cells')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('unmerge')
  await select(page, 'F6', '5:5')
  await showRibbonItem(page, 'view.freeze-panes')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'E5:G6', '4:4')
  await showRibbonItem(page, 'data.merge-cells')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await expect(merged).toHaveCount(4)
  for (const fragment of await merged.all()) {
    await expect(fragment.locator('svg')).toHaveAttribute('viewBox', original!)
    await expect(fragment.locator('[data-diagonal]')).toHaveCount(4)
  }
  await page.getByTestId('sheet-scroll').evaluate(node => { node.scrollLeft = 150; node.scrollTop = 90 })
  for (const fragment of await merged.all()) await expect(fragment.locator('svg')).toHaveAttribute('viewBox', original!)
  await info.attach('frozen-diagonals.png', { body: await page.screenshot(), contentType: 'image/png' })
})

test('hidden merged axes compress the full diagonal without restarting at the visible anchor', async ({ page }, info) => {
  await select(page, 'E5:G6', '4:4')
  await openDiagonal(page, 'diagonal-down'); await applyDiagonal(page)
  await select(page, 'E1:F1', '0:4')
  await showRibbonItem(page, 'view.row-and-column-visibility')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-columns')
  const merged = page.locator('[data-merged-cell][data-cell="4:4"]')
  await expect(merged.locator('svg')).toHaveAttribute('viewBox', '0 0 120 96')
  await expect(merged.locator('[data-diagonal]')).toHaveAttribute('x2', '120')
  await expect(merged.locator('[data-diagonal]')).toHaveAttribute('y2', '96')
  await page.getByTestId('sheet-scroll').evaluate(node => { node.scrollLeft = 420; node.scrollTop = 150 })
  await expect(merged.locator('svg')).toHaveAttribute('viewBox', '0 0 120 96')
  await info.attach('hidden-diagonal.png', { body: await page.screenshot(), contentType: 'image/png' })
})
