import { expect, test, type Page } from '@playwright/test'

const panel = (page: Page) => page.getByRole('dialog', { name: 'Find and replace' })
const results = (page: Page) => panel(page).getByRole('region', { name: 'All search results' })
const button = (page: Page, name: string) => panel(page).getByRole('button', { name, exact: true })
async function findOrders(page: Page) {
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await panel(page).getByRole('textbox', { name: 'Find what' }).fill('SO-')
  await button(page, 'Find all').click()
  await expect(results(page).getByText('Results 1–100 of 999', { exact: true })).toBeVisible()
}
async function closeWithoutHistory(page: Page) {
  await button(page, 'Close').click()
  await expect(panel(page)).toHaveCount(0)
  await expect(page.locator('[data-workbook-grid]')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const width of [1280, 390])
  test(`find all lists the first native result page without editing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await findOrders(page)
    await expect(results(page).locator('tbody tr')).toHaveCount(100)
    await expect(button(page, 'Go to Sales Orders!A2, match 1')).toBeVisible()
    await expect(panel(page).getByText('1 of 999 · Sales Orders!A2', { exact: true })).toBeVisible()
    await expect(button(page, 'First page')).toBeDisabled()
    await expect(button(page, 'Previous page')).toBeDisabled()
    await expect(button(page, 'Next page')).toBeEnabled()
    await expect(button(page, 'Last page')).toBeEnabled()
    await closeWithoutHistory(page)
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveCSS('font-weight', '700')
    await expect(page.locator('td[data-cell="3:0"]')).toHaveText('00123')
  })

for (const action of ['First page', 'Previous page']) for (const width of [1280, 390])
  test(`${action} search results returns to the native first page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await findOrders(page)
    const setup = action === 'First page' ? 'Last page' : 'Next page'
    await button(page, setup).click()
    await expect(results(page).getByText(
      setup === 'Last page' ? 'Results 901–999 of 999' : 'Results 101–200 of 999',
      { exact: true },
    )).toBeVisible()
    await button(page, action).click()
    await expect(results(page).getByText('Results 1–100 of 999', { exact: true })).toBeVisible()
    await expect(results(page).locator('tbody tr')).toHaveCount(100)
    await expect(button(page, 'Go to Sales Orders!A2, match 1')).toBeVisible()
    await expect(button(page, 'First page')).toBeDisabled()
    await expect(button(page, 'Previous page')).toBeDisabled()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A2')
    await closeWithoutHistory(page)
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await expect(page.locator('td[data-cell="3:0"]')).toHaveText('00123')
  })

for (const entry of [
  { action: 'Next page', start: 101, end: 200, address: 'A103', row: 102, value: 'SO-10102' },
  { action: 'Last page', start: 901, end: 999, address: 'A903', row: 902, value: 'SO-10902' },
]) for (const width of [1280, 390])
  test(`${entry.action} search results loads the exact native page boundary at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await findOrders(page)
    await button(page, entry.action).click()
    await expect(results(page).getByText(
      `Results ${entry.start}–${entry.end} of 999`, { exact: true },
    )).toBeVisible()
    await expect(results(page).locator('tbody tr')).toHaveCount(entry.end - entry.start + 1)
    await expect(button(page, `Go to Sales Orders!${entry.address}, match ${entry.start}`)).toBeVisible()
    await expect(button(page, 'First page')).toBeEnabled()
    await expect(button(page, 'Previous page')).toBeEnabled()
    await expect(button(page, 'Next page')).toBeEnabled({ enabled: entry.action !== 'Last page' })
    await expect(button(page, 'Last page')).toBeEnabled({ enabled: entry.action !== 'Last page' })
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(entry.address)
    await closeWithoutHistory(page)
    await expect(page.locator(`td[data-cell="${entry.row}:0"]`)).toHaveText(entry.value)
    await expect(page.locator(`td[data-cell="${entry.row}:0"]`)).toBeInViewport()
  })

for (const width of [1280, 390])
  test(`click search result selects its exact Unicode cell without editing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
    await panel(page).getByRole('textbox', { name: 'Find what' }).fill('SKU-*')
    await panel(page).getByRole('combobox', { name: 'Within' }).selectOption('workbook')
    await panel(page).getByRole('checkbox', { name: 'Use wildcards', exact: true }).check()
    await button(page, 'Find all').click()
    await expect(results(page).getByText('Results 1–4 of 4', { exact: true })).toBeVisible()
    const target = button(page, 'Go to Summary!A87, match 4')
    await target.click()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A87')
    await expect(results(page).locator('tbody tr[aria-selected="true"]')).toHaveCount(1)
    await expect(results(page).locator('tbody tr[aria-selected="true"]').getByRole('button'))
      .toHaveAttribute('aria-label', 'Go to Summary!A87, match 4')
    await closeWithoutHistory(page)
    await expect(page.locator('td[data-cell="86:0"]')).toHaveText('SKU-😀')
    await expect(page.locator('td[data-cell="86:0"]')).toBeInViewport()
    await expect(page.locator('td[data-cell="85:0"]')).toHaveText('SKU-100')
    await expect(page.locator('td[data-cell="85:1"]')).toHaveText('SKU-200')
  })
