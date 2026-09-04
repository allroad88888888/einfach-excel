import { expect, test, type Locator, type Page } from '@playwright/test'

async function navigateTo(page: Page, address: string, coordinate: string): Promise<Locator> {
  await page.goto('/')
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.fill(address)
  await nameBox.press('Enter')
  const cell = page.locator(`td[data-cell="${coordinate}"]`)
  await expect(cell).toBeVisible()
  return cell
}

test('percent format is stored and rendered through Rust', async ({ page }) => {
  const cell = await navigateTo(page, 'O3', '2:14')
  const button = page.getByRole('button', { name: 'Percent format' })

  await expect(cell).toHaveText('5%')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await button.click()
  await expect(cell).toHaveText('0.05')
  await button.click()
  await expect(cell).toHaveText('5%')
})

test('currency format is stored and rendered through Rust', async ({ page }) => {
  const cell = await navigateTo(page, 'P2', '1:15')
  const button = page.getByRole('button', { name: 'Currency format' })

  await expect(cell).toHaveText('$15.80')
  await button.click()
  await expect(cell).toHaveText('15.8')
  await button.click()
  await expect(cell).toHaveText('$15.80')
})

test('thousands format is stored and rendered through Rust', async ({ page }) => {
  const cell = await navigateTo(page, 'G9', '8:6')
  const button = page.getByRole('button', { name: 'Thousands format' })

  await expect(cell).toHaveText('2,632.00')
  await button.click()
  await expect(cell).toHaveText('2632')
  await button.click()
  await expect(cell).toHaveText('2,632.00')
})
