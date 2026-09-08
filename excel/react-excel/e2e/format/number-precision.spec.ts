import { expect, test, type Page } from '@playwright/test'

async function navigateTo(page: Page, address: string, coordinate: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.fill(address)
  await nameBox.press('Enter')
  const cell = page.locator(`td[data-cell="${coordinate}"]`)
  await expect(cell).toBeVisible()
  return cell
}

test('adjusts percent precision and retains it after scrolling away and back', async ({ page }) => {
  await page.goto('/')
  const cell = await navigateTo(page, 'O4', '3:14')
  await expect(cell).toHaveText('10.00%')
  await page.getByRole('button', { name: 'Increase decimal places' }).click()
  await expect(cell).toHaveText('10.000%')
  await page.getByRole('button', { name: 'Decrease decimal places' }).click()
  await expect(cell).toHaveText('10.00%')
  await navigateTo(page, 'A900', '899:0')
  await navigateTo(page, 'O4', '3:14')
  await expect(cell).toHaveText('10.00%')
  await page.getByRole('button', { name: 'General format' }).click()
  await expect(cell).toHaveText('0.1')
})

test('general restores the full currency value and preserves bold', async ({ page }) => {
  await page.goto('/')
  const cell = await navigateTo(page, 'P3', '2:15')
  await expect(cell).toHaveText('$125')
  await expect(cell).toHaveCSS('font-weight', '700')
  const decrease = page.getByRole('button', { name: 'Decrease decimal places' })
  await decrease.click()
  await expect(cell).toHaveText('$125')
  await page.getByRole('button', { name: 'Increase decimal places' }).click()
  await expect(cell).toHaveText('$125.0')
  await page.getByRole('button', { name: 'General format' }).click()
  await expect(cell).toHaveText('125.02')
  await expect(cell).toHaveCSS('font-weight', '700')
  await page.getByRole('button', { name: 'Increase decimal places' }).click()
  await expect(cell).toHaveText('125.020')
})

test('adjusts a range without changing formulas or dropping thousands separators', async ({
  page,
}) => {
  await page.goto('/')
  const first = await navigateTo(page, 'G9', '8:6')
  await expect(first).toHaveText('2,632.00')
  const second = page.locator('td[data-cell="9:6"]')
  await page.locator('[data-workbook-grid]').press('Shift+ArrowDown')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('G9:G10')
  // 扩选后的活动格是 G10：先给整段设千分位，再调整该格式的小数位。
  await page.getByRole('button', { name: 'Thousands format' }).click()
  await expect(second).toHaveText('1,341.00')
  await page.getByRole('button', { name: 'Decrease decimal places' }).click()
  await expect(first).toHaveText('2,632.0')
  await expect(second).toHaveText('1,341.0')
  await page.getByRole('button', { name: 'General format' }).click()
  await expect(first).toHaveText('2632')
  await expect(second).toHaveText('1341')
  await navigateTo(page, 'G9', '8:6')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E9*F9')
})
