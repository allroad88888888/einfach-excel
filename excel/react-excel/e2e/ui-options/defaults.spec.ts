import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const config = '?rowHeight=36&colWidth=160&fontSize=18'
async function open(page: Page) {
  await page.goto(`/${config}`)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
}
async function summary(page: Page) {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveText('Customer')
}
async function go(page: Page, reference: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(reference)
  await button(page, 'Go').click()
}

test('host default row height applies to blank and populated rows while explicit heights win', async ({ page }) => {
  await open(page)
  await expect.poll(async () => (await cell(page, '1:0').boundingBox())?.height).toBe(36)
  await summary(page)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.height).toBe(40)
  await expect.poll(async () => (await cell(page, '2:1').boundingBox())?.height).toBe(36)
  await go(page, 'B100')
  await expect.poll(async () => (await cell(page, '99:1').boundingBox())?.height).toBe(36)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('host default column width keeps explicit widths and aligns the editor after scrolling', async ({ page }) => {
  await open(page)
  await expect.poll(async () => (await cell(page, '1:0').boundingBox())?.width).toBe(160)
  await summary(page)
  await expect.poll(async () => (await cell(page, '1:0').boundingBox())?.width).toBe(200)
  await go(page, 'F90')
  const target = cell(page, '89:5')
  await expect.poll(async () => (await target.boundingBox())?.width).toBe(160)
  const before = (await target.boundingBox())!
  await target.dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toBeVisible()
  const box = (await editor.boundingBox())!
  expect(Math.abs(box.x - before.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(box.y - before.y)).toBeLessThanOrEqual(2)
  await editor.fill('Aligned'); await editor.press('Enter')
  await expect(target).toHaveText('Aligned')
  await expect(cell(page, '89:4')).toHaveText('Offscreen customer — Northwind International')
})

test('host default font size is inherited until explicit formatting and restored by undo', async ({ page }) => {
  await open(page)
  await expect(cell(page, '1:7')).toHaveCSS('font-size', '16px')
  await summary(page)
  await expect(cell(page, '1:0')).toHaveCSS('font-size', '18px')
  await cell(page, '1:0').click()
  const size = page.getByRole('combobox', { name: 'Font size', exact: true })
  await expect(size).toHaveValue('18')
  await size.selectOption('24')
  await expect(cell(page, '1:0')).toHaveCSS('font-size', '24px')
  await expect(cell(page, '1:1')).toHaveCSS('font-size', '18px')
  await button(page, 'Undo').click()
  await expect(cell(page, '1:0')).toHaveCSS('font-size', '18px')
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const excel of [false, true]) test(`configured defaults survive ${excel ? 'XLSX' : 'native'} file replacement`, async ({ page }) => {
  await open(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, excel ? 'Download as Excel (.xlsx)' : 'Download workbook').click()
  const file = await pending
  const buffer = await readFile((await file.path())!)
  if (!excel) {
    const saved = JSON.parse(buffer.toString())
    expect(saved.workbook.sheets[0].defaults).toEqual({ rowHeight: 36, colWidth: 160, fontSize: 18 })
    expect(saved.workbook.cells.length).toBeLessThan(20_000)
  }
  // Replacement must use the file's native defaults even when the new host prop differs.
  await page.goto('/?rowHeight=48&colWidth=220&fontSize=28')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: excel ? 'Defaults.xlsx' : 'Defaults.einfach.json',
    mimeType: excel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json',
    buffer,
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await summary(page)
  await expect(cell(page, '1:0')).toHaveCSS('font-size', '18px')
  await expect.poll(async () => (await cell(page, '1:1').boundingBox())?.height).toBe(36)
  await expect.poll(async () => (await cell(page, '1:1').boundingBox())?.width).toBe(160)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.height).toBe(40)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('canvas renderer and PNG export use the same configured dimensions', async ({ page }, info) => {
  await page.goto(`/${config}&renderer=canvas&plugins=image-export`)
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toHaveAttribute('data-painted-cells', /[1-9]\d*/)
  await go(page, 'R10:S11')
  await button(page, 'Export selection as image').click()
  await expect(button(page, 'Download PNG')).toBeEnabled()
  const pending = page.waitForEvent('download')
  await button(page, 'Download PNG').click()
  const buffer = await readFile((await (await pending).path())!)
  expect(buffer.readUInt32BE(16)).toBe(320)
  expect(buffer.readUInt32BE(20)).toBe(72)
  await button(page, 'Close').click()
  await page.screenshot({ path: info.outputPath('configured-defaults-canvas.png') })
})

test('invalid host defaults fail visibly before creating a usable workbook', async ({ page }) => {
  await page.goto('/?rowHeight=0')
  await expect(page.getByRole('alert')).toContainText('Invalid rowHeight')
  await expect(page.locator('[data-workbook-grid]')).toHaveCount(0)
})
