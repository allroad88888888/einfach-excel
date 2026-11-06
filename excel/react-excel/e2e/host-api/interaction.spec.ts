import { expect, test } from '@playwright/test'
import { call, cell, ok, start } from './support'

test('host selects scrolls and zooms with session callbacks', async ({ page }) => {
  await start(page); await ok(page, 'Select other')
  await expect(page.getByRole('textbox', { name: 'Name box', exact: true })).toHaveValue('C3')
  let result = await call(page, 'Inspect')
  expect(result.counts.selection).toBeGreaterThan(0)
  expect(result.counts.sheet).toBeGreaterThan(0)
  await ok(page, 'Scroll'); await expect(cell(page, '80:5')).toBeVisible()
  await ok(page, 'Zoom'); await expect(page.getByRole('group', { name: 'Zoom' })).toContainText('125%')
  await ok(page, 'Activate main'); await expect(cell(page, '0:0')).toHaveText('Main')
  result = await call(page, 'Inspect')
  expect(result.counts.change).toBe(1) // Initial native import only; navigation is not a workbook edit.
})

test('host begins commits and cancels editing with paired lifecycle callbacks', async ({ page }) => {
  await start(page); await call(page, 'Begin edit'); await call(page, 'Set draft')
  expect(await call(page, 'Format')).toMatchObject({ status: 'error', error: { code: 'HOST_EDITING_ACTIVE' } })
  await call(page, 'Commit edit'); await expect(cell(page, '0:0')).toHaveText('Edited by host')
  await call(page, 'Begin edit'); await call(page, 'Set draft'); await call(page, 'Cancel edit')
  const result = await call(page, 'Inspect')
  expect(result.editing.source).toBeNull()
  expect(result.counts.editing).toBe(4)
})

test('host before change cancels toolbar and API writes before history or events', async ({ page }) => {
  await start(page)
  const before = await call(page, 'Inspect')
  await call(page, 'Cancel changes')
  expect(await call(page, 'Clear')).toMatchObject({ status: 'error', error: { code: 'HOST_COMMAND_CANCELLED' } })
  await page.locator('[data-ribbon-item="format.bold"]').click()
  expect((await call(page, 'Inspect')).counts.change).toBe(before.counts.change)
  await expect(cell(page, '0:0')).toHaveCSS('font-weight', '400')
  await call(page, 'Allow changes'); await ok(page, 'Format')
  expect((await call(page, 'Inspect')).counts.change).toBe(before.counts.change + 1)
})

test('host removes subscriptions without affecting workbook edits', async ({ page }) => {
  await start(page); const before = await call(page, 'Inspect')
  await call(page, 'Unsubscribe'); await ok(page, 'Format'); await ok(page, 'Select other')
  expect((await call(page, 'Inspect')).counts).toEqual(before.counts)
  await expect(cell(page, '2:2')).toHaveCSS('font-weight', '700')
})

test('host A1 helpers convert coordinates and bounded rectangular references', async ({ page }) => {
  await start(page)
  expect(await call(page, 'Addresses')).toEqual({ cell: 'C3', range: 'C3',
    parsed: { rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 } })
})

test('host hides individual ribbon controls and restores them without resetting data', async ({ page }) => {
  await start(page); await ok(page, 'Format'); await call(page, 'Hide controls')
  await expect(page.locator('[data-ribbon-item="format.bold"]')).toHaveCount(0)
  await expect(page.locator('[data-ribbon-item="history.undo"]')).toHaveCount(0)
  await expect(page.locator('[data-ribbon-item="format.italic"]')).toBeVisible()
  await call(page, 'Show controls'); await ok(page, 'Select other')
  await expect(page.locator('[data-ribbon-item="format.bold"]')).toBeVisible()
  await expect(cell(page, '2:2')).toHaveCSS('font-weight', '700')
})

test('host header dimensions align cell hit testing and the editor after live changes', async ({ page }, info) => {
  await start(page); await call(page, 'Hide controls')
  await expect.poll(async () => (await page.locator('.row-headers').boundingBox())?.width).toBe(80)
  await expect.poll(async () => (await page.locator('.column-headers').boundingBox())?.height).toBe(40)
  await cell(page, '1:1').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toBeVisible()
  const a = (await cell(page, '1:1').boundingBox())!, b = (await editor.boundingBox())!
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2)
  await editor.fill('Aligned'); await editor.press('Enter')
  await expect(cell(page, '1:1')).toHaveText('Aligned')
  await page.screenshot({ path: info.outputPath('host-ui-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('host-ui-narrow.png') })
})

test('host canvas paint hooks draw inside the real native projection', async ({ page }, info) => {
  await start(page, '?renderer=canvas')
  await call(page, 'Hide controls')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toHaveAttribute('data-painted-cells', /[1-9]\d*/)
  expect((await call(page, 'Inspect')).painted).toBeGreaterThan(0)
  expect(await canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] === 18 && pixels[i + 1] === 171 && pixels[i + 2] === 52) return true
    return false
  })).toBe(true)
  await page.screenshot({ path: info.outputPath('host-canvas-paint.png') })
})
