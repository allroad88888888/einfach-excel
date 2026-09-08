import { expect, test, type Page } from '@playwright/test'
import { select, copy, pasteOption } from '../support/clipboard'

test.use({ screenshot: 'only-on-failure' })

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function sheet(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText(name === 'Summary' ? 'First order total' : 'Order')
}
test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('column widths copy from Summary without copying its text, bold or row height', async ({
  page,
}) => {
  await sheet(page, 'Summary')
  await select(page, 'A1:B2', '0:0')
  await copy(page)
  await sheet(page, 'Sales Orders')
  await select(page, 'B4', '3:1')
  await pasteOption(page, 'column-widths')
  await expect.poll(async () => (await cell(page, '3:1').boundingBox())?.width).toBe(200)
  await expect.poll(async () => (await cell(page, '3:2').boundingBox())?.width).toBe(120)
  await expect.poll(async () => (await cell(page, '3:1').boundingBox())?.height).toBe(28)
  await expect(cell(page, '3:1')).toHaveText('Contoso')
  await expect(cell(page, '3:1')).toHaveCSS('font-weight', '400')
  await button(page, 'Undo').click()
  await expect.poll(async () => (await cell(page, '3:1').boundingBox())?.width).toBe(120)
  await button(page, 'Redo').click()
  await expect.poll(async () => (await cell(page, '3:1').boundingBox())?.width).toBe(200)
})

test('default column width clears an existing override and preserves Summary row style', async ({
  page,
}) => {
  await select(page, 'B4', '3:1')
  await copy(page)
  await sheet(page, 'Summary')
  await select(page, 'A1', '0:0')
  await button(page, 'Paste special').click()
  await page.getByLabel('Paste content', { exact: true }).selectOption('column-widths')
  await button(page, 'Apply paste').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.width).toBe(120)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.height).toBe(40)
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await expect(cell(page, '0:0')).toHaveCSS('font-weight', '700')
  await button(page, 'Undo').click()
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.width).toBe(200)
})

test('offscreen pasted column widths align the last header and editor and survive switching', async ({
  page,
}) => {
  await sheet(page, 'Summary')
  await select(page, 'A1', '0:0')
  await copy(page)
  await sheet(page, 'Sales Orders')
  await select(page, 'B1:P1', '0:1')
  await pasteOption(page, 'column-widths')
  await select(page, 'P1001', '1000:15')
  const target = cell(page, '1000:15')
  await expect.poll(async () => (await target.boundingBox())?.width).toBe(200)
  await expect
    .poll(
      async () =>
        (
          await page
            .getByRole('columnheader', { name: 'Select column P', exact: true })
            .boundingBox()
        )?.width,
    )
    .toBe(200)
  await target.dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect.poll(async () => (await editor.boundingBox())?.width).toBe(200)
  await editor.press('Escape')
  await sheet(page, 'Summary')
  await sheet(page, 'Sales Orders')
  await select(page, 'P1001', '1000:15')
  await expect.poll(async () => (await target.boundingBox())?.width).toBe(200)
  await button(page, 'Undo').click()
  await expect.poll(async () => (await target.boundingBox())?.width).toBe(120)
})

test('copied width stays frozen when the source column is resized later', async ({ page }) => {
  await sheet(page, 'Summary')
  await select(page, 'A1', '0:0')
  await copy(page)
  await button(page, 'Row and column size').click()
  await page.getByRole('spinbutton', { name: 'Column width' }).fill('300')
  await button(page, 'Set column width').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await sheet(page, 'Sales Orders')
  await select(page, 'B4', '3:1')
  await pasteOption(page, 'column-widths')
  await expect.poll(async () => (await cell(page, '3:1').boundingBox())?.width).toBe(200)
})

test('width paste beyond the canvas rejects and leaves the source available for retry', async ({
  page,
}) => {
  await sheet(page, 'Summary')
  await select(page, 'A1:B2', '0:0')
  await copy(page)
  await sheet(page, 'Sales Orders')
  await select(page, 'P1001', '1000:15')
  await page.getByRole('combobox', { name: 'More paste options' }).selectOption('column-widths')
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
    'beyond the sheet',
  )
  await expect.poll(async () => (await cell(page, '1000:15').boundingBox())?.width).toBe(120)
  await select(page, 'O1001', '1000:14')
  await pasteOption(page, 'column-widths')
  await expect.poll(async () => (await cell(page, '1000:14').boundingBox())?.width).toBe(200)
})
