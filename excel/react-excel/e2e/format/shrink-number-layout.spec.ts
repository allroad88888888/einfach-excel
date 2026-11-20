import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { baselineCell as cell, baselineButton as button } from '../support/font-baseline'
import { glyphPixels } from '../support/font-baseline-pixels'
import { showRibbonControl } from '../support/ribbon'
import { shrinkScale } from '../support/shrink-to-fit'

const source = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Shrink number layout',
  canvases: [{ rowCount: 30, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Numbers', defaults: { rowHeight: 60 } }],
    cells: [{ sheet: 0, addr: 'A1', row: 0, col: 0, kind: 'number', value: -12345678.5 },
      { sheet: 0, addr: 'B1', row: 0, col: 1, kind: 'text', value: 'Long inventory 12345' },
      { sheet: 0, addr: 'C1', row: 0, col: 2, kind: 'text', value: 'AVAV H2O sample' }],
    richText: [{ sheet: 0, row: 0, col: 2, runs: [
      { text: 'AVAV H', format: { fontSize: 28 } },
      { text: '2', format: { fontBaseline: 'subscript' } }, { text: 'O sample', format: {} },
    ] }],
    formats: [{ sheet: 0, startRow: 0, endRow: 0, startCol: 0, endCol: 2,
      cellStyles: [
        { addr: 'A1', format: { fgColor: '#d00000', numberFormat: { kind: 'accounting', symbol: '$', digits: 2 } } },
        { addr: 'B1', format: { fgColor: '#008000', numberFormat: { kind: 'custom', pattern: '0;0;0;_W"Q"*\u00b7@_W' } } },
        { addr: 'C1', format: { fgColor: '#0000d0' } },
      ].map(entry => ({ ...entry, format: { fontSize: 24, fontFamily: 'Arial', shrinkToFit: true, ...entry.format } })) }],
  },
}))

for (const renderer of ['dom', 'canvas']) {
  test(`Accounting custom padding and mixed runs keep their anchors while shrinking in ${renderer}`, async ({ page }, info) => {
    await page.goto(`/?plugins=image-export,text-format&renderer=${renderer}`)
    if (renderer === 'canvas') await expect(page.locator('[data-workbook-grid] canvas')).toBeVisible()
    else await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, source)
    await page.evaluate(() => document.fonts.ready)
    if (renderer === 'dom') {
      for (const col of [0, 1, 2]) await expect.poll(() => shrinkScale(cell(page, `0:${col}`))).toBeLessThan(1)
      for (const col of [0, 1]) {
        const layout = cell(page, `0:${col}`).locator('.cell-fill-text')
        const box = (await layout.boundingBox())!
        const start = (await layout.locator('.cell-fill-start').boundingBox())!
        const end = (await layout.locator('.cell-fill-end').boundingBox())!
        expect(start.x).toBeCloseTo(box.x, 1)
        expect(end.x + end.width).toBeCloseTo(box.x + box.width, 1)
        expect(start.x + start.width).toBeLessThanOrEqual(end.x + 0.5)
        expect(box.width).toBeCloseTo(105, 1)
      }
      await expect(cell(page, '0:1').locator('.cell-pad')).toHaveCount(2)
      await expect(cell(page, '0:2').locator('[data-font-baseline="subscript"]')).toHaveText('2')
      const runs = cell(page, '0:2').locator('[data-shrink-to-fit] > span')
      const sizes = await runs.evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize)))
      expect(sizes[0]! / sizes[2]!).toBeCloseTo(28 / 24, 2)
      expect(sizes[1]! / sizes[2]!).toBeCloseTo(0.65, 2)
    }
    const name = page.getByRole('textbox', { name: 'Name box' })
    await name.fill('A1:C1'); await name.press('Enter')
    await showRibbonControl(page, 'Export selection as image')
    await button(page, 'Export selection as image').click()
    for (const scale of [1, 2]) {
      await page.getByLabel('Image scale').selectOption(String(scale))
      const pending = page.waitForEvent('download'); await button(page, 'Download PNG').click()
      const png = await readFile((await (await pending).path())!)
      const pixels = await glyphPixels(page, png, true)
      await info.attach(`${renderer}-number-layout-${scale}x.png`, { body: png, contentType: 'image/png' })
      await info.attach(`number-pixels-${scale}.json`, { body: JSON.stringify(pixels), contentType: 'application/json' })
      for (const [col, ink] of pixels.entries()) {
        expect(ink.count).toBeGreaterThan(20)
        expect(ink.left).toBeGreaterThanOrEqual((col * 120 + 6) * scale)
        expect(ink.right).toBeLessThan((col * 120 + 114) * scale)
        expect(ink.right - ink.left).toBeGreaterThan(80 * scale)
      }
    }
    await page.getByRole('dialog', { name: 'Export selection as image' })
      .getByRole('button', { name: 'Close', exact: true }).click()
    const saved = JSON.parse((await downloadFile(page)).toString()).workbook
    const input = JSON.parse(source.toString()).workbook
    expect(saved.richText).toEqual(input.richText)
    expect(saved.cells).toEqual(input.cells)
    for (const style of saved.formats[0].cellStyles) {
      expect(style.format.fontSize).toBe(24)
      expect(style.format.shrinkToFit).toBe(true)
    }
    await expect(button(page, 'Undo')).toBeDisabled()
  })
}
