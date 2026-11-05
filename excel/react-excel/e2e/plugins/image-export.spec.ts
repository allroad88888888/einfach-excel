import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Export selection as image' })
async function select(page: Page, range: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(range)
  await button(page, 'Go').click()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=image-export')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'C65:D67')
})

test('download selection as PNG preserves displayed conditional fills without changing history', async ({ page }) => {
  await button(page, 'Export selection as image').click()
  await expect(button(page, 'Download PNG')).toBeEnabled()
  const pending = page.waitForEvent('download')
  await button(page, 'Download PNG').click()
  const saved = await pending
  const bytes = await readFile((await saved.path())!)
  expect(saved.suggestedFilename()).toBe('Selection.png')
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(100)
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(50)
  const colors = await page.evaluate(async (data) => {
    const response = await fetch(`data:image/png;base64,${data}`)
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0); bitmap.close()
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let red = 0, blue = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 255 && pixels[i + 1] === 199 && pixels[i + 2] === 206) red++
      if (pixels[i] === 217 && pixels[i + 1] === 234 && pixels[i + 2] === 247) blue++
    }
    return { red, blue }
  }, bytes.toString('base64'))
  expect(colors.red).toBeGreaterThan(100)
  expect(colors.blue).toBeGreaterThan(100)
  await panel(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(page.locator('td[data-cell="65:2"]')).toHaveText('4')
})

test('copy PNG writes an image clipboard item', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await button(page, 'Export selection as image').click()
  await expect(button(page, 'Copy PNG')).toBeEnabled()
  await button(page, 'Copy PNG').click()
  await expect(panel(page).getByRole('status')).toHaveText('Image exported.')
  const image = await page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    const blob = await items.find((item) => item.types.includes('image/png'))!.getType('image/png')
    return { size: blob.size, type: blob.type }
  })
  expect(image.type).toBe('image/png')
  expect(image.size).toBeGreaterThan(100)
})

test('context menu opens image export for the selected cell', async ({ page }) => {
  await page.locator('td[data-cell="65:2"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Export selection as image' }).click()
  await expect(panel(page)).toBeVisible()
  await expect(button(page, 'Download PNG')).toBeEnabled()
})

test('oversized image stays correctable and never triggers a download', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'R1:Z200')
  await button(page, 'Export selection as image').click()
  await expect(button(page, 'Download PNG')).toBeEnabled()
  await page.getByLabel('Image scale').selectOption('2')
  // Reject the dimensions before allocating a huge bitmap.
  await button(page, 'Download PNG').click()
  await expect(panel(page).getByRole('alert')).toBeVisible()
  await expect(button(page, 'Download PNG')).toBeEnabled()
  await page.getByLabel('Image scale').selectOption('1')
  const download = page.waitForEvent('download')
  await button(page, 'Download PNG').click()
  await download
  await panel(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const width of [1280, 390]) test(`image export dialog fits ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 })
  await button(page, 'Export selection as image').click()
  await expect(button(page, 'Download PNG')).toBeEnabled()
  await expect(button(page, 'Copy PNG')).toBeInViewport()
  await expect(button(page, 'Download PNG')).toBeInViewport()
  await page.screenshot({ path: info.outputPath(`image-export-${width}.png`), fullPage: true })
  await page.getByLabel('Image scale').press('Escape')
  await expect(panel(page)).toHaveCount(0)
})
