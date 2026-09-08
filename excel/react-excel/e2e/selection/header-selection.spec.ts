import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, row: number, col: number) => page.locator(`td[data-cell="${row}:${col}"]`)

test('row headers select full rows and Shift click extends the selection', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, 2, 0)).toBeVisible()
  await page.getByRole('button', { name: 'Select row 3', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A3:P3')
  await expect(page.getByText('Count: 16', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Select row 5', exact: true })
    .click({ modifiers: ['Shift'] })
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A3:P5')
  await page.getByRole('button', { name: 'Fill color', exact: true }).click()
  await expect(cell(page, 2, 0)).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await expect(cell(page, 4, 0)).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await expect(cell(page, 5, 0)).not.toHaveCSS('background-color', 'rgb(255, 242, 204)')
})

test('column style reaches the last row and later row/column formatting wins at intersections', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, 2, 0)).toBeVisible()
  const row = page.getByRole('button', { name: 'Select row 3', exact: true })
  const column = page.getByRole('columnheader', { name: 'Select column B' })
  const bold = page.getByRole('button', { name: 'Bold', exact: true })
  await row.click()
  await bold.click()
  await expect(cell(page, 2, 0)).toHaveCSS('font-weight', '700')
  await column.click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B1:B1001')
  await bold.click()
  await expect(cell(page, 0, 1)).toHaveCSS('font-weight', '700')
  await row.click()
  await bold.click()
  await expect(cell(page, 2, 1)).toHaveCSS('font-weight', '400')
  await column.click()
  await bold.click()
  await expect(cell(page, 0, 1)).toHaveCSS('font-weight', '400')
  await bold.click()
  await expect(cell(page, 2, 1)).toHaveCSS('font-weight', '700')
  await expect(cell(page, 2, 0)).toHaveCSS('font-weight', '400')
  await page.getByTestId('sheet-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(cell(page, 1000, 1)).toHaveCSS('font-weight', '700')
  await expect(cell(page, 1000, 1)).toHaveAttribute('data-selected', 'true')
  await column.click()
  await expect(cell(page, 0, 1)).toBeVisible()
  await expect(bold).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('columnheader', { name: 'Select column K' }).click()
  await expect(cell(page, 0, 10)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('K1:K1001')
})

test('the corner selects and formats the full sheet including cells outside the viewport', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, 0, 0)).toBeVisible()
  const corner = page.getByRole('button', { name: 'Select all cells' })
  await corner.click()
  await expect(corner).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A1:P1001')
  await expect(page.getByText('Count: 16016', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  await expect(cell(page, 0, 0)).toHaveCSS('font-style', 'italic')
  await page.getByTestId('sheet-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.scrollLeft = element.scrollWidth
  })
  await expect(cell(page, 1000, 15)).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, 1000, 15)).toHaveCSS('font-style', 'italic')
  await cell(page, 1000, 15).click()
  await expect(page.getByText('Count: 1', { exact: true })).toBeVisible()
  await expect(corner).toHaveAttribute('aria-pressed', 'false')
})

test('clicking a header during editing saves the value once before selecting', async ({ page }) => {
  await page.goto('/')
  await cell(page, 2, 0).dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor' })
  await editor.fill('Header commit')
  await page.getByRole('button', { name: 'Select row 4', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(cell(page, 2, 0)).toHaveText('Header commit')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A4:P4')
  await expect(page.locator('[data-workbook-grid]')).toBeFocused()
})
