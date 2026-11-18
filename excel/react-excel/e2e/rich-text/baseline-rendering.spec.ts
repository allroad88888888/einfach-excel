import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { glyphPixels, expectBaselinePixels } from '../support/font-baseline-pixels'
import { showRibbonControl } from '../support/ribbon'
import { open, selectText, text, dialog, button, save, cell, go } from '../support/rich-baseline'

const source = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Inline glyph pixels',
  canvases: [{ rowCount: 30, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Pixels', defaults: { rowHeight: 60 } }],
    cells: [{ sheet: 0, addr: 'A1', row: 0, col: 0, kind: 'text', value: 'HgHgHg' }],
    richText: [{ sheet: 0, row: 0, col: 0, runs: ['#d00000', '#008000', '#0000d0'].map(color => ({
      text: 'Hg', format: { color },
    })) }],
    formats: [{ sheet: 0, startRow: 0, endRow: 0, startCol: 0, endCol: 0,
      cellStyles: [{ addr: 'A1', format: { fontSize: 32, fontFamily: 'Arial' } }] }],
  },
}))

for (const renderer of ['dom', 'canvas']) {
  test(`edited inline glyphs paint distinct baseline pixels in ${renderer} and exported PNG`, async ({ page }, info) => {
    await page.goto(`/?plugins=text-format,image-export&renderer=${renderer}`)
    if (renderer === 'canvas') await expect(page.locator('[data-workbook-grid] canvas')).toBeVisible()
    else await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, source); await open(page, 'A1')
    await selectText(text(page), 2, 2); await button(dialog(page), 'Superscript').click()
    await selectText(text(page), 4, 2); await button(dialog(page), 'Subscript').click(); await save(page)
    await go(page, 'A1')
    let bytes: Buffer
    if (renderer === 'canvas') {
      const canvas = page.locator('[data-workbook-grid] canvas')
      const screenshot = async () => Buffer.from(await canvas.evaluate(node =>
        (node as HTMLCanvasElement).toDataURL('image/png').split(',')[1]!), 'base64')
      await expect.poll(async () => (await glyphPixels(page, await screenshot())).every(box => box.count > 10)).toBe(true)
      bytes = await screenshot()
      await expect(page.locator('td[data-cell]')).toHaveCount(0)
    } else {
      await expect(cell(page, '0:0').locator('.cell-content > span')).toHaveCount(3)
      bytes = await cell(page, '0:0').screenshot()
    }
    await info.attach(`inline-${renderer}.png`, { body: bytes, contentType: 'image/png' })
    expectBaselinePixels(await glyphPixels(page, bytes))
    await showRibbonControl(page, 'Export selection as image')
    await button(page, 'Export selection as image').click()
    await expect(button(page, 'Download PNG')).toBeEnabled()
    const pending = page.waitForEvent('download'); await button(page, 'Download PNG').click()
    const png = await readFile((await (await pending).path())!)
    await info.attach(`inline-${renderer}-export.png`, { body: png, contentType: 'image/png' })
    expectBaselinePixels(await glyphPixels(page, png))
    await page.getByRole('dialog', { name: 'Export selection as image' })
      .getByRole('button', { name: 'Close', exact: true }).click()
    await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
    await open(page, 'A1'); await selectText(text(page), 0, 6)
    await expect(button(dialog(page), 'Superscript')).toHaveAttribute('aria-pressed', 'false')
  })
}
