import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, address: string) => page.locator(`td[data-cell="${address}"]`)
async function start(page: Page, query = '?plugins=date-picker') {
  await page.goto(`/${query}`)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill('A20')
  await button(page, 'Go').click()
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
}

test('choose a date beside the cell editor commits through Rust in one undo', async ({ page }) => {
  await start(page)
  await cell(page, '19:0').dblclick()
  await expect(page.getByLabel('Choose date', { exact: true })).toHaveValue('2024-02-28')
  await page.getByLabel('Choose date', { exact: true }).fill('2024-02-29')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Use date').click()
  await expect(cell(page, '19:0')).toHaveText('2024-02-29')
  await expect(page.getByLabel('Choose date', { exact: true })).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '19:0')).toHaveText('2024-02-29')
  await expect(cell(page, '19:2')).not.toHaveText('2024-02-29')
})

test('date picker in the formula bar keeps focus inside editing until Use date', async ({ page }) => {
  await start(page)
  await page.getByRole('textbox', { name: 'Active cell value', exact: true }).click()
  await page.getByLabel('Choose date', { exact: true }).fill('2025-12-31')
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Use date').click()
  await expect(cell(page, '19:0')).toHaveText('2025-12-31')
  await button(page, 'Undo').click()
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
})

test('cancel date selection keeps the original value and history', async ({ page }) => {
  await start(page)
  await cell(page, '19:0').dblclick()
  await page.getByLabel('Choose date', { exact: true }).fill('2024-02-29')
  await button(page, 'Cancel date edit').click()
  await expect(page.getByLabel('Choose date', { exact: true })).toHaveCount(0)
  await expect(cell(page, '19:0')).toHaveText('2024-02-28')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('without the plugin dates keep the ordinary editor', async ({ page }) => {
  await start(page, '')
  await cell(page, '19:0').dblclick()
  await expect(page.getByRole('textbox', { name: 'Cell editor' })).toBeVisible()
  await expect(page.getByLabel('Choose date', { exact: true })).toHaveCount(0)
})

for (const width of [1280, 390]) test(`date picker remains visible at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 })
  await start(page)
  await cell(page, '19:0').dblclick()
  await expect(page.getByLabel('Choose date', { exact: true })).toBeInViewport()
  await expect(button(page, 'Use date')).toBeInViewport()
  await page.screenshot({ path: info.outputPath(`date-picker-${width}.png`), fullPage: true })
  await page.getByLabel('Choose date', { exact: true }).press('Escape')
  await expect(page.getByRole('textbox', { name: 'Cell editor' })).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
