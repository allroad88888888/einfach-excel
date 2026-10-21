import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, row: number) => page.locator(`td[data-cell="${row}:0"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const choice = (page: Page, id: string) => page.getByRole('checkbox', { name: `Select value ${id}`, exact: true })
const valuesPage = (page: Page) => page.getByLabel('Filter values page', { exact: true })
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, 1)).toHaveText('SO-10001')
  await select(page, 'A1:H1001', '0:0')
  await page.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  await button(page, 'Filter column A').click()
  await button(page, 'Choose values for condition 1').click()
  await expect(valuesPage(page)).toHaveText('1–50 of 1000')
})

for (const action of ['Enter search', 'next page', 'previous page']) for (const width of [1280, 390])
  test(`filter values ${action} retains exact offscreen choices at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = page.getByRole('dialog', { name: 'Filter conditions' })
    if (action === 'Enter search') {
      const search = page.getByRole('searchbox', { name: 'Search filter values' })
      await search.fill('SO-11000')
      await search.press('Enter')
      await expect(valuesPage(page)).toHaveText('1–1 of 1')
      await expect(dialog).toBeVisible()
      await expect(choice(page, 'SO-10001')).toHaveCount(0)
      await expect(button(page, 'Previous filter values page')).toBeDisabled()
      await expect(button(page, 'Next filter values page')).toBeDisabled()
      await choice(page, 'SO-11000').check()
    } else {
      if (action === 'next page') await choice(page, 'SO-10001').check()
      await expect(button(page, 'Previous filter values page')).toBeDisabled()
      await button(page, 'Next filter values page').click()
      await expect(valuesPage(page)).toHaveText('51–100 of 1000')
      await expect(choice(page, 'SO-10001')).toHaveCount(0)
      await choice(page, 'SO-10051').check()
      if (action === 'previous page') {
        await button(page, 'Previous filter values page').click()
        await expect(valuesPage(page)).toHaveText('1–50 of 1000')
        await choice(page, 'SO-10001').check()
        await button(page, 'Next filter values page').click()
        await expect(valuesPage(page)).toHaveText('51–100 of 1000')
        await expect(choice(page, 'SO-10051')).toBeChecked()
      }
    }
    const selected = action === 'Enter search' ? 1 : 2
    await expect(page.getByLabel('Selected filter values')).toHaveText(`${selected} selected`)
    await expect(cell(page, 2)).toHaveText('SO-10002')
    await button(page, 'Apply filter').click()
    await expect(dialog).toHaveCount(0)
    await expect(cell(page, 0)).toHaveText('Order')
    if (action === 'Enter search') {
      await expect(cell(page, 1000)).toHaveText('SO-11000')
      await expect(cell(page, 1)).toHaveCount(0)
    } else {
      await expect(cell(page, 1)).toHaveText('SO-10001')
      await expect(cell(page, 51)).toHaveText('SO-10051')
      await expect(cell(page, 1)).toHaveCSS('font-weight', '700')
      await expect(cell(page, 1000)).toHaveCount(0)
    }
    await expect(cell(page, 2)).toHaveCount(0)
    await button(page, 'Undo').click()
    await select(page, 'A2', '1:0')
    await expect(cell(page, 1)).toHaveText('SO-10001')
    await expect(cell(page, 2)).toHaveText('SO-10002')
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText('1 undo · 1 redo')
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await expect(cell(page, 2)).toHaveCount(0)
    await expect(cell(page, action === 'Enter search' ? 1000 : 51)).toHaveText(
      action === 'Enter search' ? 'SO-11000' : 'SO-10051',
    )
    await button(page, 'Filter column A').click()
    await button(page, 'Choose values for condition 1').click()
    await expect(page.getByLabel('Selected filter values')).toHaveText(`${selected} selected`)
  })
