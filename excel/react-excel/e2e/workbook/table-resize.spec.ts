import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function open(page: Page) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table DemoTable').click()
  return page.getByRole('dialog', { name: 'Tables', exact: true })
}
async function close(page: Page) {
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function resize(page: Page, range: string) {
  await page.getByLabel('Table range', { exact: true }).fill(range)
  await button(page, 'Resize table').click()
  await expect(button(page, 'Resize table')).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(button(page, 'Edit table DemoTable')).toContainText(range)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '4:1')).toHaveText('60')
})

test('resizing moves totals, adds a native column and keeps one undo step', async ({ page }) => {
  await open(page); await resize(page, 'A80:C88')
  await expect(page.getByLabel('Column', { exact: true }).locator('option')).toHaveText(['Product', 'Amount', 'Column1'])
  await close(page)
  await select(page, 'C80', '79:2'); await expect(cell(page, '79:2')).toHaveText('Column1')
  await select(page, 'B88', '87:1'); await expect(cell(page, '87:1')).toHaveText('60')
  await expect(formula(page)).toHaveValue('=SUBTOTAL(109,DemoTable[Amount])')
  await select(page, 'B84', '83:1'); await expect(cell(page, '83:1')).toHaveText('')
  await button(page, 'Undo').click()
  await expect(cell(page, '83:1')).toHaveText('60')
  await expect(button(page, 'Undo')).toBeDisabled()
  await select(page, 'C80', '79:2'); await expect(cell(page, '79:2')).toHaveText('')
  await button(page, 'Redo').click()
  await expect(cell(page, '79:2')).toHaveText('Column1')
  await open(page); await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:C88')
})

test('cross-sheet structured arrays resize and removed columns remain explicit reference errors', async ({ page }) => {
  await button(page, 'New sheet').click()
  await select(page, 'A1', '0:0'); await formula(page).fill('=DemoTable[#All]'); await formula(page).press('Enter')
  await expect(cell(page, '4:1')).toHaveText('60')
  await select(page, 'E1', '0:4'); await formula(page).fill('=SUM(DemoTable[Amount])'); await formula(page).press('Enter')
  await expect(cell(page, '0:4')).toHaveText('60')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await open(page); await resize(page, 'A80:C88'); await close(page)
  await page.getByRole('tab', { name: 'Sheet3', exact: true }).click()
  await expect(cell(page, '0:2')).toHaveText('Column1')
  await expect(cell(page, '8:1')).toHaveText('60')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await open(page); await resize(page, 'A80:A88'); await close(page)
  await page.getByRole('tab', { name: 'Sheet3', exact: true }).click()
  await expect(cell(page, '0:4')).toHaveText('#REF!')
  await select(page, 'E1', '0:4'); await expect(formula(page)).toHaveValue('=SUM(#REF!)')
  await button(page, 'Undo').click()
  await expect(cell(page, '0:4')).toHaveText('60')
  await expect(formula(page)).toHaveValue('=SUM(DemoTable[Amount])')
  await expect(cell(page, '8:1')).toHaveText('60')
  await button(page, 'Redo').click(); await expect(cell(page, '0:4')).toHaveText('#REF!')
})

test('invalid resize keeps the draft correctable and preserves redo', async ({ page }) => {
  await open(page); await resize(page, 'A80:C88'); await close(page)
  await button(page, 'Undo').click(); await open(page)
  await page.getByLabel('Table range', { exact: true }).fill('A81:C86')
  await button(page, 'Resize table').click()
  await expect(page.getByRole('alert')).toContainText('original row')
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A81:C86')
  await close(page); await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click(); await open(page)
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:C88')
  await resize(page, 'A80:B84')
})

test('occupied totals destination does not overwrite demo data or consume history', async ({ page }) => {
  await open(page)
  await page.getByLabel('Table range', { exact: true }).fill('A80:C86')
  await button(page, 'Resize table').click()
  await expect(page.getByRole('alert')).toContainText('totals row contains data')
  await close(page); await expect(button(page, 'Undo')).toBeDisabled()
  await select(page, 'B86', '85:1'); await expect(cell(page, '85:1')).toHaveText('SKU-200')
  await select(page, 'B84', '83:1'); await expect(cell(page, '83:1')).toHaveText('60')
})

for (const width of [1280, 390]) test(`resize controls fit ${width}px and support keyboard activation`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  const dialog = await open(page)
  await page.getByLabel('Table range', { exact: true }).fill('A80:C88')
  await button(page, 'Resize table').focus()
  await expect(button(page, 'Resize table')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(button(page, 'Edit table DemoTable')).toContainText('A80:C88')
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width)
  const contrast = await button(page, 'Resize table').evaluate((node) => {
    const luminance = (color: string) => {
      const channels = color.match(/\d+/g)!.slice(0, 3).map(Number).map((value) => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    }
    const style = getComputedStyle(node)
    const foreground = luminance(style.color), background = luminance(style.backgroundColor)
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
  await button(page, 'Resize table').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath(`table-resize-${width}.png`) })
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  await expect(button(page, 'Tables')).toBeFocused()
  expect(errors).toEqual([])
})
