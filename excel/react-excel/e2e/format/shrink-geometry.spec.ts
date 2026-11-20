import { expect, test } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { baselineCell as cell, baselineButton as button, baselineGlyphBox } from '../support/font-baseline'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { shrinkWorkbook, shrinkLongText } from '../support/shrink-workbook'
import { expectShrinkFits, setShrinkColumnWidth, shrinkScale, shrinkText } from '../support/shrink-to-fit'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/?plugins=text-format')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, shrinkWorkbook)
  await page.evaluate(() => document.fonts.ready)
})

test('column width and zoom remeasure glyphs without changing the nominal font size', async ({ page }, info) => {
  const target = cell(page, '0:0'), short = cell(page, '0:1')
  await select(page, 'A1', '0:0')
  const before = await expectShrinkFits(target)
  const scale = await shrinkScale(target)
  expect(scale).toBeLessThan(0.5)
  await expect(shrinkText(short)).toHaveAttribute('data-shrink-scale', '1')
  await setShrinkColumnWidth(page, 600)
  await expect(shrinkText(target)).toHaveAttribute('data-shrink-scale', '1')
  const expanded = await expectShrinkFits(target)
  expect(expanded.height).toBeGreaterThan(before.height * 2)
  await button(page, 'Undo').click()
  await expect.poll(() => shrinkScale(target)).toBeCloseTo(scale, 3)
  await expect(target).toHaveCSS('font-size', '24px')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(shrinkLongText)
  await page.getByRole('slider', { name: 'Zoom level' }).fill('150')
  await expect(page.getByTestId('sheet-scroll')).toHaveAttribute('data-zoom', '150')
  // CSS zoom rounds table borders in screen pixels: logical content width can change
  // (105px -> 105.333px at 150%). Verify the new glyph boundary, not an identical factor.
  const zoomed = await expectShrinkFits(target)
  expect(await shrinkScale(target)).toBeLessThan(1)
  expect(zoomed.width / before.width).toBeCloseTo(1.5, 1)
  await info.attach('zoom-glyphs.json', { body: JSON.stringify({ before, zoomed }), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('shrink-zoom-150.png') })
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('merge and center-across shrink use the full span while respecting indent', async ({ page }) => {
  const merged = page.locator('[data-merged-cell][data-cell="0:3"]')
  await expect(merged).toHaveAttribute('aria-colspan', '2')
  const regular = await expectShrinkFits(cell(page, '0:0'))
  const merge = await expectShrinkFits(merged)
  expect(merge.width).toBeGreaterThan(regular.width * 2)
  await expect(cell(page, '0:4')).toHaveAttribute('aria-hidden', 'true')
  const across = cell(page, '4:0')
  await expect(across).toHaveAttribute('data-center-across', '3')
  const glyph = await expectShrinkFits(across)
  const right = (await cell(page, '4:2').boundingBox())!
  expect(glyph.x + glyph.width).toBeLessThanOrEqual(right.x + right.width - 7)
  const indented = await expectShrinkFits(cell(page, '5:0'))
  expect(indented.width).toBeLessThan(regular.width - 10)
})

test('hard breaks vertical text and imported wrap win while ordinary rotation still shrinks', async ({ page }) => {
  for (const coord of ['1:0', '1:1', '1:2']) {
    await expect(shrinkText(cell(page, coord))).toHaveCount(0)
    await expect(cell(page, coord)).toHaveCSS('font-size', '24px')
  }
  await select(page, 'A2', '1:0'); await showRibbonItem(page, 'format.shrink-to-fit')
  await expect(button(page, 'Shrink to fit')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('note')).toHaveText('Line breaks and vertical text keep their original size.')
  const rotated = page.locator('[data-merged-cell][data-cell="2:3"]')
  await expect.poll(() => shrinkScale(rotated)).toBeLessThan(1)
  const glyph = await baselineGlyphBox(rotated), box = (await rotated.boundingBox())!
  expect(glyph.x).toBeGreaterThan(box.x)
  expect(glyph.x + glyph.width).toBeLessThan(box.x + box.width)
  expect(glyph.y).toBeGreaterThan(box.y)
  expect(glyph.bottom).toBeLessThan(box.y + box.height)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('auto-fit expands unshrunk natural text and undo restores the fitted glyphs', async ({ page }) => {
  await select(page, 'A1', '0:0')
  const scale = await shrinkScale(cell(page, '0:0'))
  const handle = page.getByRole('separator', { name: 'Resize column A', exact: true })
  await handle.dblclick()
  await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(400)
  await expect(shrinkText(cell(page, '0:0'))).toHaveAttribute('data-shrink-scale', '1')
  await expect(cell(page, '0:0')).toHaveCSS('font-size', '24px')
  await button(page, 'Undo').click()
  await expect.poll(() => shrinkScale(cell(page, '0:0'))).toBeCloseTo(scale, 3)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('late fonts and remounted cells remeasure without writing workbook history', async ({ page }) => {
  const target = cell(page, '6:0')
  const original = await shrinkScale(target)
  await page.evaluate(async () => {
    const face = new FontFace(
      'ShrinkLate',
      'local("Arial"), local("Liberation Sans"), local("LiberationSans-Regular"), local("DejaVu Sans")',
    )
    document.fonts.add(face)
    await face.load()
    await document.fonts.ready
  })
  await expect.poll(() => shrinkScale(target)).toBeGreaterThan(original * 1.1)
  const loaded = await expectShrinkFits(target)
  await select(page, 'A90', '89:0')
  await expect(target).toHaveCount(0)
  await select(page, 'A7', '6:0')
  const remounted = await expectShrinkFits(target)
  expect(remounted.width).toBeCloseTo(loaded.width, 1)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('filter header reserves its button width before fitting the label', async ({ page }) => {
  await select(page, 'A1:B7', '0:0')
  const original = await expectShrinkFits(cell(page, '0:0'))
  await showRibbonItem(page, 'data.worksheet-filter')
  await page.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  const filter = button(page, 'Filter column A')
  await expect(filter).toBeVisible()
  const fitted = await expectShrinkFits(cell(page, '0:0'))
  expect(fitted.width).toBeLessThan(original.width - 20)
  const reserved = (await filter.boundingBox())!
  expect(fitted.x + fitted.width).toBeLessThanOrEqual(reserved.x + 0.5)
})
