import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Alternating colors', exact: true })
const blue = 'rgb(232, 240, 254)'
async function go(page: Page, ref: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(ref)
  await button(page, 'Go').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function open(page: Page) {
  await button(page, 'Alternating colors').click()
  await expect(dialog(page)).toBeVisible()
}
async function apply(page: Page) {
  await button(page, 'Apply').click()
  await expect(dialog(page)).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

test('apply alternating colors relative to the selected range with one undo step', async ({ page }) => {
  await go(page, 'B64:B67'); await open(page); await apply(page)
  await expect(cell(page, '63:1')).toHaveCSS('background-color', blue)
  await expect(cell(page, '64:1')).not.toHaveCSS('background-color', blue)
  await expect(cell(page, '65:1')).toHaveCSS('background-color', blue)
  await expect(cell(page, '66:1')).not.toHaveCSS('background-color', blue)
  await expect(cell(page, '65:2')).toHaveText('4')
  await expect(cell(page, '65:2')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  await button(page, 'Undo').click()
  await expect(cell(page, '63:1')).not.toHaveCSS('background-color', blue)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '63:1')).toHaveCSS('background-color', blue)
})

test('mark the first row as a header and update the existing band in one undo step', async ({ page }) => {
  await go(page, 'B64:B67'); await open(page); await apply(page)
  await go(page, 'B65'); await open(page)
  await expect(page.getByLabel('Applies to', { exact: true })).toHaveValue('B64:B67')
  await page.getByLabel('First row is a header').check()
  await page.getByLabel('Band color').fill('#d9ead3'); await apply(page)
  await expect(cell(page, '63:1')).not.toHaveCSS('background-color', blue)
  await expect(cell(page, '64:1')).toHaveCSS('background-color', 'rgb(217, 234, 211)')
  await expect(cell(page, '65:1')).not.toHaveCSS('background-color', blue)
  await expect(cell(page, '66:1')).toHaveCSS('background-color', 'rgb(217, 234, 211)')
  await expect(cell(page, '65:2')).toHaveText('4')
  await button(page, 'Undo').click()
  await expect(cell(page, '63:1')).toHaveCSS('background-color', blue)
  await expect(cell(page, '64:1')).not.toHaveCSS('background-color', 'rgb(217, 234, 211)')
})

test('remove banding preserves underlying fills and unrelated conditions with undo', async ({ page }) => {
  await go(page, 'D65:D67'); await open(page); await apply(page)
  await expect(cell(page, '64:3')).toHaveCSS('background-color', blue)
  await expect(cell(page, '65:3')).toHaveCSS('background-color', 'rgb(217, 234, 247)')
  await open(page); await button(page, 'Remove banding').click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(cell(page, '64:3')).not.toHaveCSS('background-color', blue)
  await expect(cell(page, '65:3')).toHaveCSS('background-color', 'rgb(217, 234, 247)')
  await expect(cell(page, '65:2')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  await button(page, 'Undo').click()
  await expect(cell(page, '64:3')).toHaveCSS('background-color', blue)
  await button(page, 'Redo').click()
  await expect(cell(page, '64:3')).not.toHaveCSS('background-color', blue)
})

test('native seed bands keep header formatting and move with inserted rows', async ({ page }) => {
  await go(page, 'H85:H89')
  await expect(cell(page, '84:7')).toHaveText('Alternating colors')
  await expect(cell(page, '84:7')).not.toHaveCSS('background-color', blue)
  await expect(cell(page, '85:7')).toHaveCSS('background-color', blue)
  await expect(cell(page, '86:7')).not.toHaveCSS('background-color', blue)
  await expect(cell(page, '87:7')).toHaveCSS('background-color', blue)
  await expect(button(page, 'Undo')).toBeDisabled()
  await open(page); await expect(page.getByLabel('First row is a header')).toBeChecked()
  await button(page, 'Cancel').click()
  await go(page, 'H85')
  await page.getByRole('combobox', { name: 'Insert or delete rows and columns' }).selectOption('insert-rows')
  await expect(cell(page, '86:7')).toHaveCSS('background-color', blue)
  await go(page, 'H87'); await open(page)
  await expect(page.getByLabel('Applies to', { exact: true })).toHaveValue('H86:H90')
  await button(page, 'Cancel').click(); await button(page, 'Undo').click()
  await expect(cell(page, '85:7')).toHaveCSS('background-color', blue)
})

test('native file round trip keeps banding editable without baking it into cell styles', async ({ page }) => {
  await go(page, 'B64:B67'); await open(page); await apply(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const file = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  expect(JSON.stringify(file.workbook.conditionalFormats)).toContain('alternating-colors-1')
  expect(JSON.stringify(file.workbook.formats)).not.toContain('#e8f0fe')
  await button(page, 'Close').click()
  await open(page); await button(page, 'Remove banding').click()
  await button(page, 'File').click()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Banding.einfach.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)),
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await go(page, 'B65'); await open(page)
  await expect(page.getByLabel('Applies to', { exact: true })).toHaveValue('B64:B67')
  await expect(button(page, 'Remove banding')).toBeEnabled()
  await button(page, 'Cancel').click()
  await expect(cell(page, '63:1')).toHaveCSS('background-color', blue)
})

for (const width of [1280, 390]) test(`banding dialog fits ${width}px and restores focus on Escape`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  await go(page, 'H85:H89'); await open(page)
  await expect(page.getByLabel('Band color')).toBeFocused()
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await expect(button(page, 'Apply')).toBeInViewport()
  await expect(button(page, 'Remove banding')).toBeInViewport()
  await page.screenshot({ path: info.outputPath(`alternating-colors-${width}.png`), fullPage: true })
  await page.getByLabel('Band color').press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(button(page, 'Alternating colors')).toBeFocused()
  await expect(button(page, 'Undo')).toBeDisabled()
  expect(errors).toEqual([])
})
