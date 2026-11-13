import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openDateFile as openFile } from '../support/conditional-dates'
import { showRibbonControl } from '../support/ribbon'
import { applyBaseline, baselineButton as button, baselineCell as cell } from '../support/font-baseline'
import { select } from '../support/clipboard'
import { baselinePixelFile, glyphPixels, expectBaselinePixels } from '../support/font-baseline-pixels'

test('DOM glyphs and exported PNG preserve baseline ordering and nominal font size in actual pixels', async ({ page }, info) => {
  await page.goto('/?plugins=image-export')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, baselinePixelFile)
  await expect(cell(page, '0:2')).toHaveText('Hg')
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A1:C1'); await name.press('Enter')
  for (const col of [0, 1, 2]) await expect(cell(page, `0:${col}`)).toHaveCSS('font-size', '20px')
  const first = (await cell(page, '0:0').boundingBox())!
  const last = (await cell(page, '0:2').boundingBox())!
  const dom = await page.screenshot({ path: info.outputPath('baseline-dom-pixels.png'),
    clip: { x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height } })
  const domPixels = await glyphPixels(page, dom)
  expectBaselinePixels(domPixels)
  await showRibbonControl(page, 'Export selection as image')
  await button(page, 'Export selection as image').click()
  await expect(button(page, 'Download PNG')).toBeEnabled()
  const pending = page.waitForEvent('download')
  await button(page, 'Download PNG').click()
  const png = await readFile((await (await pending).path())!)
  await info.attach('baseline-export.png', { body: png, contentType: 'image/png' })
  const pngPixels = await glyphPixels(page, png)
  expectBaselinePixels(pngPixels)
  await info.attach('baseline-pixels.json', { body: JSON.stringify({ domPixels, pngPixels }, null, 2), contentType: 'application/json' })
  const panel = page.getByRole('dialog', { name: 'Export selection as image' })
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('actual Canvas renderer paints smaller raised and lowered glyphs inside unchanged cells', async ({ page }, info) => {
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toBeVisible()
  await openFile(page, baselinePixelFile)
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A1:C1'); await name.press('Enter')
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  const png = async () => Buffer.from(await canvas.evaluate(element =>
    (element as HTMLCanvasElement).toDataURL('image/png').split(',')[1]!), 'base64')
  await expect.poll(async () => (await glyphPixels(page, await png())).every(box => box.count > 10)).toBe(true)
  const bytes = await png()
  await info.attach('baseline-canvas-pixels.png', { body: bytes, contentType: 'image/png' })
  const pixels = await glyphPixels(page, bytes)
  expectBaselinePixels(pixels)
  await info.attach('baseline-canvas-pixels.json', { body: JSON.stringify(pixels, null, 2), contentType: 'application/json' })
  await expect(page.locator('td[data-cell]')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('auto-fit measures the scaled baseline glyphs without changing their nominal font size', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, baselinePixelFile)
  const widths: number[] = []
  for (const [index, letter] of ['A', 'B', 'C'].entries()) {
    const handle = page.getByRole('separator', { name: `Resize column ${letter}`, exact: true })
    await handle.dblclick()
    await expect(handle).not.toHaveAttribute('aria-valuenow', '120')
    widths.push(Number(await handle.getAttribute('aria-valuenow')))
    await expect(cell(page, `0:${index}`)).toHaveCSS('font-size', '20px')
    expect(await cell(page, `0:${index}`).locator('.cell-content').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  }
  expect(widths[1]).toBeLessThan(widths[0]!)
  expect(widths[2]).toBe(widths[1])
  await button(page, 'Undo').click()
  await expect(page.getByRole('separator', { name: 'Resize column C', exact: true })).toHaveAttribute('aria-valuenow', '120')
  await expect(cell(page, '0:2').locator('[data-font-baseline="subscript"]')).toHaveText('Hg')
})

test('baseline keeps Accounting currency and number anchored to the full content width', async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B19', '18:1')
  const target = cell(page, '18:1')
  const layout = target.locator('.cell-fill-text')
  const before = (await layout.boundingBox())!
  await applyBaseline(page, 'Superscript')
  await expect(target.locator('.cell-fill-start [data-font-baseline]')).toHaveText('$', { useInnerText: true })
  await expect(target.locator('.cell-fill-end [data-font-baseline]')).toHaveText('(1,234.50)', { useInnerText: true })
  const after = (await layout.boundingBox())!
  expect(after.width).toBeCloseTo(before.width, 1)
  expect(after.x).toBeCloseTo(before.x, 1)
  const start = (await target.locator('.cell-fill-start').boundingBox())!
  const end = (await target.locator('.cell-fill-end').boundingBox())!
  expect(start.x).toBeCloseTo(after.x, 1)
  expect(end.x + end.width).toBeCloseTo(after.x + after.width, 1)
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('-1234.5')
  await expect(cell(page, '18:0').locator('[data-font-baseline]')).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(target.locator('[data-font-baseline]')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
