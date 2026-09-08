import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste, pasteOption } from '../support/clipboard'

const merged = (page: Page, coord = '1:1') =>
  page.locator(`[data-merged-cell][data-cell="${coord}"]`)
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function mergeSource(page: Page, address = 'B2:C3') {
  await select(page, address, '1:1')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Merge cells', exact: true })
    .click()
  await expect(merged(page)).toHaveText('Acme Co.')
}
test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('copy pastes a merged rectangle and undo restores destination formulas and geometry', async ({
  page,
}) => {
  await mergeSource(page)
  await copy(page)
  await select(page, 'F2', '1:5')
  await paste(page)
  await expect(merged(page, '1:5')).toHaveText('Acme Co.')
  await expect(merged(page, '1:5')).toHaveAttribute('aria-rowspan', '2')
  await expect(merged(page, '1:5')).toHaveAttribute('aria-colspan', '2')
  await button(page, 'Undo').click()
  await expect(merged(page, '1:5')).toHaveCount(0)
  await expect(cell(page, '1:5')).toHaveText('79')
  await select(page, 'G2', '1:6')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
  await button(page, 'Redo').click()
  await expect(merged(page, '1:5')).toHaveText('Acme Co.')
  await expect(merged(page)).toHaveText('Acme Co.')
})

test('overlapping cut moves the source frame and one undo restores the original frame', async ({
  page,
}) => {
  await mergeSource(page)
  await copy(page, 'Cut')
  // A1:B2 与原 B2:C3 有一个交叠格；用真实名称框选择目标锚点。
  await select(page, 'A1', '0:0')
  await paste(page)
  await expect(merged(page, '0:0')).toHaveText('Acme Co.')
  await expect(merged(page)).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(merged(page)).toHaveText('Acme Co.')
  await expect(merged(page, '0:0')).toHaveCount(0)
})

test('external scalar paste changes only the merged anchor and retains the frame', async ({
  page,
}) => {
  await mergeSource(page)
  await page.evaluate(() => navigator.clipboard.writeText('42'))
  await paste(page)
  await expect(merged(page)).toHaveText('42')
  await expect(merged(page)).toHaveAttribute('aria-colspan', '2')
  await button(page, 'Undo').click()
  await expect(merged(page)).toHaveText('Acme Co.')
})

test('transpose copies the rotated merged shape', async ({ page }) => {
  await mergeSource(page, 'B2:D3')
  await copy(page)
  await select(page, 'F2', '1:5')
  await pasteOption(page, 'transpose')
  await expect(merged(page, '1:5')).toHaveAttribute('aria-rowspan', '3')
  await expect(merged(page, '1:5')).toHaveAttribute('aria-colspan', '2')
  await expect(merged(page, '1:5')).toHaveText('Acme Co.')
})

test('copy to another worksheet keeps the merged shape and values-only keeps the target layout', async ({
  page,
}) => {
  await mergeSource(page)
  await copy(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'C5', '4:2')
  await paste(page)
  await expect(merged(page, '4:2')).toHaveText('Acme Co.')
  await select(page, 'A12', '11:0')
  await paste(page, 'Paste values only')
  await expect(cell(page, '11:0')).toHaveText('Acme Co.')
  await expect(merged(page, '11:0')).toHaveCount(0)
})

test('partial-copy rejection is readable and a corrected selection can retry', async ({
  page,
}, info) => {
  await mergeSource(page)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await button(page, 'Select row 2').click()
    await button(page, 'Copy').click()
    await expect(page.getByLabel('Clipboard status')).toContainText('whole merged cells')
    await page.getByLabel('Clipboard status').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: info.outputPath(`merge-copy-error-${width}.png`),
      fullPage: true,
    })
    await select(page, 'B2:C3', '1:1')
    await copy(page)
  }
  await select(page, 'F5', '4:5')
  await paste(page)
  await expect(merged(page, '4:5')).toHaveText('Acme Co.')
})
