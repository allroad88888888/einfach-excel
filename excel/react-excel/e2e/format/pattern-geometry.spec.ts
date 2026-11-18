import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { setShrinkColumnWidth } from '../support/shrink-to-fit'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { patternCell as cell, patternWorkbook, openPattern, applyPattern } from '../support/pattern-fill'
import { patternPixels, assertPatternPixels } from '../support/pattern-pixels'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, patternWorkbook)
})

test('pattern tiles keep their logical size through column resizing and zoom without editing cell facts', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await openPattern(page, 'lightUp', '#c00000', '#fff2cc'); await applyPattern(page)
  for (const width of [64, 210]) {
    await setShrinkColumnWidth(page, width)
    const native = JSON.parse((await downloadFile(page)).toString()).workbook
    for (const zoom of ['100', '150', '200']) {
      await page.getByRole('slider', { name: 'Zoom level' }).fill(zoom)
      await expect(cell(page, '1:1')).toHaveCSS('background-size', '8px 8px')
      await expect(cell(page, '1:1')).toHaveJSProperty('offsetHeight', 64)
      await select(page, 'A1', '0:0'); await page.mouse.move(0, 0)
      assertPatternPixels(await patternPixels(page, await cell(page, '1:1').screenshot(), Number(zoom) / 100), 'lightUp')
      expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(native)
    }
    await page.getByRole('slider', { name: 'Zoom level' }).fill('100')
    await select(page, 'B2', '1:1')
  }
})

test('a merged pattern retains full bounds and phase across four frozen fragments and scroll', async ({ page }, info) => {
  await select(page, 'E5:G6', '4:4'); await openPattern(page, 'lightGrid', '#c00000', '#fff2cc'); await applyPattern(page)
  const merged = page.locator('[data-merged-cell][data-cell="4:4"]')
  await expect(merged).toHaveCSS('width', '384px'); await expect(merged).toHaveCSS('height', '128px')
  await showRibbonItem(page, 'data.merge-cells')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('unmerge')
  await select(page, 'F6', '5:5'); await showRibbonItem(page, 'view.freeze-panes')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'E5:G6', '4:4'); await showRibbonItem(page, 'data.merge-cells')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await select(page, 'A1', '0:0'); await page.mouse.move(0, 0)
  await expect(merged).toHaveCount(4)
  const image = await merged.first().evaluate(node => getComputedStyle(node).backgroundImage)
  for (const fragment of await merged.all()) {
    await expect(fragment).toHaveCSS('width', '384px'); await expect(fragment).toHaveCSS('height', '128px')
    await expect(fragment).toHaveCSS('background-image', image)
    await expect(fragment).toHaveCSS('background-position', '0px 0px')
  }
  const box = (await merged.first().boundingBox())!
  const clip = { x: box.x + 16, y: box.y + 16, width: 32, height: 32 }
  const before = await patternPixels(page, await page.screenshot({ clip }), 1, 0, 0)
  assertPatternPixels(before, 'lightGrid')
  await page.getByTestId('sheet-scroll').evaluate(node => { node.scrollLeft = 151; node.scrollTop = 91 })
  expect(await patternPixels(page, await page.screenshot({ clip }), 1, 0, 0)).toEqual(before)
  for (const fragment of await merged.all()) await expect(fragment).toHaveCSS('background-image', image)
  await info.attach('frozen-pattern.png', { body: await page.screenshot(), contentType: 'image/png' })
})

test('hiding merged columns compresses bounds without rescaling the eight-pixel pattern', async ({ page }, info) => {
  await select(page, 'E5:G6', '4:4'); await openPattern(page, 'darkDown', '#c00000', '#fff2cc'); await applyPattern(page)
  await select(page, 'E1:F1', '0:4'); await showRibbonItem(page, 'view.row-and-column-visibility')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-columns')
  const merged = page.locator('[data-merged-cell][data-cell="4:4"]')
  await expect(merged).toHaveCSS('width', '128px'); await expect(merged).toHaveCSS('height', '128px')
  await expect(merged).toHaveCSS('background-size', '8px 8px')
  await select(page, 'A1', '0:0'); await page.mouse.move(0, 0)
  assertPatternPixels(await patternPixels(page, await merged.screenshot()), 'darkDown')
  await info.attach('hidden-pattern.png', { body: await page.screenshot(), contentType: 'image/png' })
})
