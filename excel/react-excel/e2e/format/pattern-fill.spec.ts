import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { patternCell as cell, patternButton as button, patternWorkbook, openPattern, applyPattern,
  expectPattern } from '../support/pattern-fill'
import { patternMasks, patternPixels, assertPatternPixels } from '../support/pattern-pixels'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, patternWorkbook)
  await expect(cell(page, '0:0')).toHaveText('Pattern fixture')
})

test('Pattern selector applies all seventeen patterns with distinct geometry and one-step undo', async ({ page }, info) => {
  test.setTimeout(180_000)
  for (const pattern of Object.keys(patternMasks)) {
    await select(page, 'B2:C2', '1:1')
    const before = JSON.parse((await downloadFile(page)).toString()).workbook
    await openPattern(page, pattern, '#c00000', '#fff2cc'); await applyPattern(page)
    const after = JSON.parse((await downloadFile(page)).toString()).workbook
    expect(after.cells).toEqual(before.cells)
    for (const addr of ['B2', 'C2']) {
      const format = after.formats.flatMap((f: { cellStyles: { addr: string; format: unknown }[] }) => f.cellStyles)
        .find((style: { addr: string }) => style.addr === addr).format
      expect(format).toMatchObject({ bgColor: '#fff2cc', fill: { kind: 'pattern', pattern, foreground: '#c00000' } })
    }
    await expect(cell(page, '1:2')).toHaveCSS('color', 'rgb(18, 58, 188)')
    await expect(cell(page, '1:2')).toHaveText('C2 kept')
    await expectPattern(page, '2:1')
    await select(page, 'E1', '0:4'); await page.mouse.move(0, 0)
    const png = await cell(page, '1:1').screenshot()
    assertPatternPixels(await patternPixels(page, png), pattern)
    await info.attach(`${pattern}.png`, { body: png, contentType: 'image/png' })
    await button(page, 'Undo').click()
    expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(before)
    await button(page, 'Redo').click()
    expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(after)
  }
})

test('Pattern color changes only the pattern strokes in one undoable command', async ({ page }) => {
  await select(page, 'B2', '1:1'); await openPattern(page, 'lightDown', '#c00000', '#fff2cc'); await applyPattern(page)
  const before = JSON.parse((await downloadFile(page)).toString()).workbook
  await openPattern(page); await page.getByLabel('Pattern color', { exact: true }).fill('#008000'); await applyPattern(page)
  await select(page, 'E1', '0:4'); await page.mouse.move(0, 0)
  assertPatternPixels(await patternPixels(page, await cell(page, '1:1').screenshot()), 'lightDown', [0, 128, 0])
  await expectPattern(page, '2:1')
  await button(page, 'Undo').click()
  expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(before)
})

test('Background color changes only the pattern base in one undoable command', async ({ page }) => {
  await select(page, 'B2', '1:1'); await openPattern(page, 'darkUp', '#c00000', '#fff2cc'); await applyPattern(page)
  const before = JSON.parse((await downloadFile(page)).toString()).workbook
  await openPattern(page); await page.getByLabel('Background color', { exact: true }).fill('#abcdef'); await applyPattern(page)
  await select(page, 'E1', '0:4'); await page.mouse.move(0, 0)
  assertPatternPixels(await patternPixels(page, await cell(page, '1:1').screenshot()), 'darkUp', [192, 0, 0], [171, 205, 239])
  await expectPattern(page, '2:1')
  await button(page, 'Undo').click()
  expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(before)
})
