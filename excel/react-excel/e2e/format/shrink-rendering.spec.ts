import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { baselineCell as cell, baselineButton as button } from '../support/font-baseline'
import { glyphPixels } from '../support/font-baseline-pixels'
import { showRibbonControl } from '../support/ribbon'

const source = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Shrink raster',
  canvases: [{ rowCount: 30, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Pixels', defaults: { rowHeight: 60 } }],
    cells: ['A1', 'B1', 'C1'].map((addr, col) => ({ sheet: 0, addr, row: 0, col, kind: 'text',
      value: col === 2 ? 'Hg' : 'AVAV inventory 12345' })),
    formats: [{ sheet: 0, startRow: 0, endRow: 0, startCol: 0, endCol: 2,
      cellStyles: ['#d00000', '#008000', '#0000d0'].map((fgColor, col) => ({
        addr: `${String.fromCharCode(65 + col)}1`, format: {
          fontSize: 24, fontFamily: 'Arial', fgColor, shrinkToFit: col !== 1,
        },
      })) }],
  },
}))

function assertRaster(boxes: Awaited<ReturnType<typeof glyphPixels>>, scale = 1) {
  const [shrunk, plain, short] = boxes
  for (const box of boxes) expect(box.count).toBeGreaterThan(20)
  expect(shrunk!.height).toBeLessThan(plain!.height * 0.7)
  expect(shrunk!.right - shrunk!.left + 1).toBeLessThanOrEqual(106 * scale)
  expect(shrunk!.right - shrunk!.left + 1).toBeGreaterThan(95 * scale)
  expect(short!.height).toBeGreaterThan(plain!.height * 0.85)
  expect(plain!.left).toBeGreaterThan(shrunk!.right)
  expect(short!.left).toBeGreaterThan(plain!.right)
}

for (const renderer of ['dom', 'canvas']) {
  test(`shrink paints complete smaller glyphs in ${renderer} and PNG at both image scales`, async ({ page }, info) => {
    await page.goto(`/?plugins=image-export,text-format&renderer=${renderer}`)
    const canvas = page.locator('[data-workbook-grid] canvas')
    if (renderer === 'canvas') await expect(canvas).toBeVisible()
    else await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, source)
    const name = page.getByRole('textbox', { name: 'Name box' })
    await name.fill('A5'); await name.press('Enter')
    await page.evaluate(() => document.fonts.ready)
    const screenshot = async () => {
      if (renderer === 'canvas') {
        return Buffer.from(
          await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL('image/png').split(',')[1]!),
          'base64',
        )
      }
      const first = (await cell(page, '0:0').boundingBox())!
      const last = (await cell(page, '0:2').boundingBox())!
      return page.screenshot({
        clip: { x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height },
      })
    }
    await expect.poll(async () => (await glyphPixels(page, await screenshot(), true)).every(box => box.count > 20)).toBe(true)
    const screen = await screenshot()
    assertRaster(await glyphPixels(page, screen, true))
    await info.attach(`shrink-${renderer}.png`, { body: screen, contentType: 'image/png' })
    await name.fill('A1:C1'); await name.press('Enter')
    await showRibbonControl(page, 'Export selection as image')
    await button(page, 'Export selection as image').click()
    const evidence = []
    for (const scale of [1, 2]) {
      await page.getByLabel('Image scale').selectOption(String(scale))
      await expect(button(page, 'Download PNG')).toBeEnabled()
      const pending = page.waitForEvent('download'); await button(page, 'Download PNG').click()
      const png = await readFile((await (await pending).path())!)
      const pixels = await glyphPixels(page, png, true)
      assertRaster(pixels, scale)
      evidence.push({ scale, pixels })
      await info.attach(`shrink-${renderer}-${scale}x.png`, { body: png, contentType: 'image/png' })
    }
    await info.attach('shrink-pixels.json', { body: JSON.stringify(evidence), contentType: 'application/json' })
    await page.getByRole('dialog', { name: 'Export selection as image' })
      .getByRole('button', { name: 'Close', exact: true }).click()
    await expect(button(page, 'Undo')).toBeDisabled()
  })
}
