import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

async function open(page: Page, hide: string) {
  await page.goto(`/?hide=${hide}`)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
}

test('a host can hide the header, ribbon and formula bar', async ({ page }) => {
  await open(page, 'header,ribbon,formulaBar')
  await expect(page.getByRole('toolbar', { name: /tools$/ })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveCount(0)
  await expect(page.locator('.workbook-header')).toHaveCount(0)
  await cell(page, '2:1').dblclick()
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toBeVisible()
})

test('a host can hide the sheet tabs and the status bar', async ({ page }) => {
  await open(page, 'sheetBar,statusBar')
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveCount(0)
  await expect(page.getByText('Selected: 1')).toBeHidden()
  await expect(page.getByRole('group', { name: 'Zoom' })).toBeHidden()
})

test('a host can hide single context menu items', async ({ page }) => {
  await open(page, 'menu:cells.insert')
  await cell(page, '2:1').click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'Cell actions' }).getByRole('menuitem'))
    .toHaveText(['Delete…'])
})

test('a host can turn the cell context menu off', async ({ page }) => {
  await open(page, 'menu')
  await cell(page, '2:1').click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'Cell actions' })).toHaveCount(0)
})
