import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { showRibbonControl } from '../support/ribbon'
import { patternCell as cell, patternButton as button } from '../support/pattern-fill'
import { patternMasks, patternPixels, assertPatternPixels } from '../support/pattern-pixels'

const patterns = Object.keys(patternMasks)
const source = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Pattern raster', canvases: [{ rowCount: 30, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Pixels', defaults: { rowHeight: 64, colWidth: 128 } }],
    cells: [], formats: [{ sheet: 0, startRow: 0, endRow: 5, startCol: 0, endCol: 2,
      cellStyles: patterns.map((pattern, index) => ({
        addr: `${String.fromCharCode(65 + index % 3)}${Math.floor(index / 3) + 1}`,
        format: { bgColor: '#fff2cc', fill: { kind: 'pattern', pattern, foreground: '#c00000' } },
      })) }],
  },
}))

for (const deviceScale of [1, 2]) test.describe(`device scale ${deviceScale}`, () => {
  test.use({ deviceScaleFactor: deviceScale })
  for (const renderer of ['dom', 'canvas'])
  test(`all pattern masks paint in ${renderer} and in 1x 2x PNG without the optional editor`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.goto(`/?plugins=image-export&renderer=${renderer}`)
    const canvas = page.locator('[data-workbook-grid] canvas')
    if (renderer === 'canvas') await expect(canvas).toBeVisible()
    else await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, source)
    const name = page.getByRole('textbox', { name: 'Name box' })
    await name.fill('E1'); await name.press('Enter'); await page.mouse.move(0, 0)
    for (let i = 0; i < patterns.length; i++) {
      const screenshot = async () => renderer === 'canvas'
        ? Buffer.from(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL('image/png').split(',')[1]!), 'base64')
        : cell(page, `${Math.floor(i / 3)}:${i % 3}`).screenshot()
      // The canvas includes a reusable overscan margin outside the CSS-clipped viewport.
      const x = renderer === 'canvas' ? 16 + (i % 3) * 128 - Number(await canvas.getAttribute('data-viewport-x')) : 16
      const y = renderer === 'canvas' ? 16 + Math.floor(i / 3) * 64 - Number(await canvas.getAttribute('data-viewport-y')) : 16
      await expect(async () => assertPatternPixels(await patternPixels(page, await screenshot(), deviceScale, x, y), patterns[i]!))
        .toPass({ timeout: 5000 })
    }
    await info.attach(`patterns-${renderer}.png`, { body: await page.screenshot(), contentType: 'image/png' })
    await name.fill('A1:C6'); await name.press('Enter')
    await showRibbonControl(page, 'Export selection as image'); await button(page, 'Export selection as image').click()
    for (const scale of [1, 2]) {
      await page.getByLabel('Image scale').selectOption(String(scale))
      await expect(button(page, 'Download PNG')).toBeEnabled()
      const pending = page.waitForEvent('download'); await button(page, 'Download PNG').click()
      const png = await readFile((await (await pending).path())!)
      for (let i = 0; i < patterns.length; i++) assertPatternPixels(
        await patternPixels(page, png, scale, 16 + (i % 3) * 128, 16 + Math.floor(i / 3) * 64), patterns[i]!)
      await info.attach(`patterns-${renderer}-${scale}x.png`, { body: png, contentType: 'image/png' })
    }
    await page.getByRole('dialog', { name: 'Export selection as image' })
      .getByRole('button', { name: 'Close', exact: true }).click()
    await expect(button(page, 'Undo')).toBeDisabled()
  })
})
