import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function go(page: Page, ref: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(ref)
  await button(page, 'Go').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function apply(page: Page) {
  await go(page, 'B64:B67')
  await button(page, 'Alternating colors').click()
  await page.getByLabel('Band color').fill('#12ab34')
  await button(page, 'Apply').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('canvas paints and removes the same native banding through the ribbon', async ({ page }) => {
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toHaveAttribute('data-painted-cells', /[1-9]\d*/)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await apply(page)
  await go(page, 'A64') // Move the selection tint away from the band.
  const pixels = () => canvas.evaluate((node) => {
    const el = node as HTMLCanvasElement
    const image = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data
    let count = 0
    for (let i = 0; i < image.length; i += 4)
      if (image[i] === 18 && image[i + 1] === 171 && image[i + 2] === 52) count++
    return count
  })
  await expect.poll(pixels).toBeGreaterThan(1000)
  await go(page, 'B65'); await button(page, 'Alternating colors').click()
  await button(page, 'Remove banding').click(); await go(page, 'A64')
  await expect.poll(pixels).toBe(0)
  await button(page, 'Undo').click(); await go(page, 'A64')
  await expect.poll(pixels).toBeGreaterThan(1000)
})

test('Excel round trip retains the formula colors and recognizes imported banding', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await apply(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download as Excel (.xlsx)').click()
  const bytes = await readFile((await (await pending).path())!)
  await button(page, 'Close').click()
  await button(page, 'File').click()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Banding.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes,
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await go(page, 'B64')
  await expect(page.locator('td[data-cell="63:1"]')).toHaveCSS('background-color', 'rgb(18, 171, 52)')
  await expect(page.locator('td[data-cell="64:1"]')).not.toHaveCSS('background-color', 'rgb(18, 171, 52)')
  await button(page, 'Alternating colors').click()
  await expect(page.getByLabel('Applies to', { exact: true })).toHaveValue('B64:B67')
  await expect(button(page, 'Remove banding')).toBeEnabled()
  await button(page, 'Remove banding').click()
  await expect(page.locator('td[data-cell="63:1"]')).not.toHaveCSS('background-color', 'rgb(18, 171, 52)')
})
