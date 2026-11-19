import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { setShrinkColumnWidth } from '../support/shrink-to-fit'
import { openDateFile as openFile } from '../support/conditional-dates'
import { cell, stops, gradientWorkbook, openGradient, applyGradient, nativeWorkbook } from '../support/gradient-fill'
import { assertGradientPixels } from '../support/gradient-pixels'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, gradientWorkbook)
})

test('linear gradient angle follows physical non-square bounds through resizing and zoom', async ({ page }) => {
  await select(page, 'B2', '1:1'); await openGradient(page)
  await page.getByLabel('Angle (degrees)', { exact: true }).fill('45'); await applyGradient(page)
  for (const width of [80, 210]) {
    await setShrinkColumnWidth(page, width)
    const native = await nativeWorkbook(page)
    for (const zoom of ['100', '150', '200']) {
      await page.getByRole('slider', { name: 'Zoom level' }).fill(zoom)
      await select(page, 'A1', '0:0'); await page.mouse.move(0, 0)
      await assertGradientPixels(page, await cell(page, '1:1').screenshot(),
        { kind: 'linear-gradient', degree: 45, stops }, Number(zoom) / 100, 0, 0, width, 64)
      expect(await nativeWorkbook(page)).toEqual(native)
    }
    await page.getByRole('slider', { name: 'Zoom level' }).fill('100')
    await select(page, 'B2', '1:1')
  }
})

test('rectangular merged fill retains full bounds across frozen fragments and compressed hidden columns', async ({ page }, info) => {
  await select(page, 'E5:G6', '4:4'); await openGradient(page, 'path-gradient')
  await page.getByLabel('Inner color', { exact: true }).fill('#ff0000')
  await page.getByLabel('Outer color', { exact: true }).fill('#0000ff'); await applyGradient(page)
  const fill = { kind: 'path-gradient' as const, left: 0.5, right: 0.5, top: 0.5, bottom: 0.5,
    stops: [{ position: 0, color: '#ff0000' }, { position: 1, color: '#0000ff' }] }
  const merged = page.locator('[data-merged-cell][data-cell="4:4"]')
  await expect(merged).toHaveCSS('width', '384px'); await expect(merged).toHaveCSS('height', '128px')
  await select(page, 'A1', '0:0'); await page.mouse.move(0, 0)
  await assertGradientPixels(page, await merged.screenshot(), fill, 1, 0, 0, 384, 128)
  await select(page, 'E5:G6', '4:4'); await showRibbonItem(page, 'data.merge-cells')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('unmerge')
  await select(page, 'F6', '5:5'); await showRibbonItem(page, 'view.freeze-panes')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'E5:G6', '4:4'); await showRibbonItem(page, 'data.merge-cells')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await select(page, 'A1', '0:0'); await page.mouse.move(0, 0)
  await expect(merged).toHaveCount(4)
  const image = await merged.first().evaluate(node => getComputedStyle(node).backgroundImage)
  for (const fragment of await merged.all()) {
    await expect(fragment).toHaveCSS('width', '384px')
    await expect(fragment).toHaveCSS('height', '128px')
    await expect(fragment).toHaveCSS('background-image', image)
  }
  const box = (await merged.first().boundingBox())!
  const clip = { x: box.x + 15, y: box.y + 15, width: 40, height: 30 }
  const before = await page.screenshot({ clip })
  await page.getByTestId('sheet-scroll').evaluate(node => { node.scrollLeft = 151; node.scrollTop = 91 })
  expect(await page.screenshot({ clip })).toEqual(before)
  await info.attach('frozen-gradient.png', { body: await page.screenshot(), contentType: 'image/png' })
  await showRibbonItem(page, 'view.freeze-panes')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('unfreeze')
  await select(page, 'E1:F1', '0:4'); await showRibbonItem(page, 'view.row-and-column-visibility')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-columns')
  await expect(merged).toHaveCount(1); await expect(merged).toHaveCSS('width', '128px')
  await select(page, 'A1', '0:0'); await page.mouse.move(0, 0)
  await assertGradientPixels(page, await merged.screenshot(), fill, 1, 0, 0, 128, 128)
})
