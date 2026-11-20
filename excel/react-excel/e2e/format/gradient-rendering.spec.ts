import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { showRibbonControl } from '../support/ribbon'
import { cell, button } from '../support/gradient-fill'
import { assertGradientPixels, type GradientSpec } from '../support/gradient-pixels'

const colors = [{ position: 0, color: '#ff0000' }, { position: 1, color: '#0000ff' }]
const hardEdge = [{ position: 0.43, color: '#ff0000' }, { position: 0.43, color: '#0000ff' }]
const path = { kind: 'path-gradient', left: 0.2, right: 0.7, top: 0.15, bottom: 0.6, stops: colors } as const
const gradients: GradientSpec[] = [
  ...[0, 45, 90, -450, 1e100].map(degree => ({ kind: 'linear-gradient' as const, degree, stops: colors })),
  path, { ...path, left: 0.8, right: 0.2, top: 0.7, bottom: 0.3 },
  { ...path, left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 },
  { ...path, left: 0.5, right: 0.5, top: 0.2, bottom: 0.8 },
  { ...path, left: 0, right: 1, top: 0, bottom: 1 },
  { ...path, left: 0, right: 0, top: 0, bottom: 0 },
  { ...path, left: 1, right: 1, top: 1, bottom: 1 },
  { ...path, stops: [] }, { ...path, stops: [{ position: 0.3, color: '#abcdef' }] },
  { ...path, stops: [{ position: 0.8, color: '#0000ff' }, { position: 0.2, color: '#ff0000' }] },
  { ...path, stops: Array.from({ length: 256 }, (_, i) => ({ position: i / 255, color: '#abcdef' })) },
  { kind: 'linear-gradient', degree: 0, stops: hardEdge },
  { ...path, left: 0.25, right: 0.75, top: 0.25, bottom: 0.75, stops: hardEdge },
]
const source = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Gradient raster', canvases: [{ rowCount: 30, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Pixels', defaults: { rowHeight: 64, colWidth: 128 } }],
    cells: [], formats: [{ sheet: 0, startRow: 0, endRow: 4, startCol: 0, endCol: 3,
      cellStyles: gradients.map((fill, i) => ({ addr: `${String.fromCharCode(65 + i % 4)}${Math.floor(i / 4) + 1}`,
        format: { fill, bgColor: '#123456' } })) }],
  },
}))

for (const deviceScale of [1, 2]) test.describe(`gradient device scale ${deviceScale}`, () => {
  test.use({ deviceScaleFactor: deviceScale })
  for (const renderer of ['dom', 'canvas'])
  test(`linear and rectangular gradients match independent distance samples in ${renderer} and PNG`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.goto(`/?plugins=image-export&renderer=${renderer}`)
    const canvas = page.locator('[data-workbook-grid] canvas')
    if (renderer === 'canvas') await expect(canvas).toBeVisible()
    else await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, source)
    const name = page.getByRole('textbox', { name: 'Name box' })
    await name.fill('F1'); await name.press('Enter'); await page.mouse.move(0, 0)
    for (let i = 0; i < gradients.length; i++) {
      const screenshot = async () => renderer === 'canvas'
        ? Buffer.from(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL('image/png').split(',')[1]!), 'base64')
        : cell(page, `${Math.floor(i / 4)}:${i % 4}`).screenshot()
      const x = renderer === 'canvas' ? (i % 4) * 128 - Number(await canvas.getAttribute('data-viewport-x')) : 0
      const y = renderer === 'canvas' ? Math.floor(i / 4) * 64 - Number(await canvas.getAttribute('data-viewport-y')) : 0
      await expect(async () => assertGradientPixels(page, await screenshot(), gradients[i]!, deviceScale, x, y))
        .toPass({ timeout: 5000 })
    }
    await info.attach(`gradients-${renderer}.png`, { body: await page.screenshot(), contentType: 'image/png' })
    await name.fill('A1:D5'); await name.press('Enter')
    await showRibbonControl(page, 'Export selection as image'); await button(page, 'Export selection as image').click()
    for (const scale of [1, 2]) {
      await page.getByLabel('Image scale').selectOption(String(scale))
      await expect(button(page, 'Download PNG')).toBeEnabled()
      const pending = page.waitForEvent('download'); await button(page, 'Download PNG').click()
      const png = await readFile((await (await pending).path())!)
      for (let i = 0; i < gradients.length; i++) await assertGradientPixels(page, png, gradients[i]!,
        scale, (i % 4) * 128, Math.floor(i / 4) * 64)
      await info.attach(`gradients-${renderer}-${scale}x.png`, { body: png, contentType: 'image/png' })
    }
    await page.getByRole('dialog', { name: 'Export selection as image' })
      .getByRole('button', { name: 'Close', exact: true }).click()
    await expect(button(page, 'Undo')).toBeDisabled()
  })
})
