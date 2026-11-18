import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { showRibbonControl } from '../support/ribbon'
import { diagonalCell as cell, diagonalButton as button } from '../support/diagonal-borders'
import { diagonalPixels } from '../support/diagonal-pixels'

const source = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Diagonal raster', canvases: [{ rowCount: 30, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Pixels', defaults: { rowHeight: 60, colWidth: 120 } }],
    cells: [], formats: [{ sheet: 0, startRow: 0, endRow: 0, startCol: 0, endCol: 2,
      cellStyles: [
        { addr: 'A1', format: { borders: { diagDown: { style: 'thin', color: '#c00000' } } } },
        { addr: 'B1', format: { borders: { diagUp: { style: 'medium', color: '#0000d0' } } } },
        { addr: 'C1', format: { borders: { diagDown: { style: 'double', color: '#008000' },
          diagUp: { style: 'double', color: '#008000' } } } },
      ] }],
  },
}))

function assertStrokes(boxes: Awaited<ReturnType<typeof diagonalPixels>>, scale = 1) {
  const [down, up, both] = boxes
  for (const box of boxes) {
    expect(box.count).toBeGreaterThan(90 * scale)
    expect(box.width).toBeGreaterThan(115 * scale)
    expect(box.width).toBeLessThanOrEqual(121 * scale)
    expect(box.height).toBeGreaterThan(55 * scale)
    expect(box.height).toBeLessThanOrEqual(61 * scale)
  }
  expect(down!.slope).toBeCloseTo(0.5, 1)
  expect(up!.slope).toBeCloseTo(-0.5, 1)
  expect(Math.abs(both!.slope)).toBeLessThan(0.05)
  expect(both!.count).toBeGreaterThan(down!.count * 2)
  if (scale === 2) expect(both!.bands).toBe(4)
}

for (const renderer of ['dom', 'canvas'])
  test(`diagonal directions and parallel double strokes paint in ${renderer} and 1x 2x PNG`, async ({ page }, info) => {
    await page.goto(`/?plugins=image-export&renderer=${renderer}`)
    const canvas = page.locator('[data-workbook-grid] canvas')
    if (renderer === 'canvas') await expect(canvas).toBeVisible()
    else await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, source)
    const name = page.getByRole('textbox', { name: 'Name box' })
    await name.fill('F3'); await name.press('Enter')
    const first = renderer === 'dom' ? await cell(page, '0:0').boundingBox() : null
    // Sample the complete three-cell rectangle, excluding unrelated blue selection chrome.
    const screenshot = async () => renderer === 'canvas'
      ? Buffer.from(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL('image/png').split(',')[1]!), 'base64')
      : page.screenshot({ clip: { x: first!.x, y: first!.y, width: first!.width * 3, height: first!.height } })
    await expect.poll(async () => (await diagonalPixels(page, await screenshot())).every(p => p.count > 90)).toBe(true)
    const screen = await screenshot()
    await info.attach(`diagonal-${renderer}.png`, { body: screen, contentType: 'image/png' })
    assertStrokes(await diagonalPixels(page, screen))
    await name.fill('A1:C1'); await name.press('Enter')
    await showRibbonControl(page, 'Export selection as image'); await button(page, 'Export selection as image').click()
    for (const scale of [1, 2]) {
      await page.getByLabel('Image scale').selectOption(String(scale))
      await expect(button(page, 'Download PNG')).toBeEnabled()
      const pending = page.waitForEvent('download'); await button(page, 'Download PNG').click()
      const png = await readFile((await (await pending).path())!)
      assertStrokes(await diagonalPixels(page, png), scale)
      await info.attach(`diagonal-${renderer}-${scale}x.png`, { body: png, contentType: 'image/png' })
    }
    await page.getByRole('dialog', { name: 'Export selection as image' })
      .getByRole('button', { name: 'Close', exact: true }).click()
    await expect(button(page, 'Undo')).toBeDisabled()
  })
