import { expect, test, type Locator, type Page } from '@playwright/test'

async function selectedCell(page: Page): Promise<Locator> {
  await page.goto('/')
  const cell = page.locator('td[data-cell="2:0"]')
  await expect(cell).toBeVisible()
  await cell.click()
  return cell
}

test('Fill color toggles the selected Rust cell background', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Fill color' })
  const initial = await cell.evaluate((element) => getComputedStyle(element).backgroundColor)

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(cell).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(cell).toHaveCSS('background-color', initial)
})

test('Text color toggles the selected Rust cell foreground', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Text color' })
  const initial = await cell.evaluate((element) => getComputedStyle(element).color)

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(cell).toHaveCSS('color', 'rgb(192, 0, 0)')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(cell).toHaveCSS('color', initial)
})

test('Horizontal alignment cycles center, right and left through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Horizontal alignment' })

  for (const alignment of ['center', 'right', 'left']) {
    await button.click()
    await expect(cell).toHaveCSS('text-align', alignment)
  }
})

test('Vertical alignment cycles top, center and bottom through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Vertical alignment' })

  for (const alignment of ['top', 'middle', 'bottom']) {
    await button.click()
    await expect(cell).toHaveCSS('vertical-align', alignment)
  }
})

test('Text rotation cycles up, down and off through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Text rotation' })

  await button.click()
  await expect(cell.locator('.cell-rotated-text')).toHaveAttribute('style', /rotate\(45deg\)/)
  await button.click()
  await expect(cell.locator('.cell-rotated-text')).toHaveAttribute('style', /rotate\(-45deg\)/)
  await button.click()
  await expect(cell.locator('.cell-rotated-text')).toHaveCount(0)
})

test('Borders toggles thin borders through Rust', async ({ page }) => {
  const cell = await selectedCell(page)
  const button = page.getByRole('button', { name: 'Borders' })

  await button.click()
  await expect(cell).toHaveCSS('border-top-style', 'solid')
  await expect(cell).toHaveCSS('border-top-width', '1px')
  await expect(cell).toHaveCSS('border-top-color', 'rgb(127, 127, 127)')
  await button.click()
  await expect(cell).toHaveCSS('border-top-style', 'none')
})

test('shows the second format batch in the original Rust seed', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:3"]')).toHaveCSS(
    'background-color',
    'rgb(255, 242, 204)',
  )
  await expect(page.locator('td[data-cell="1:4"]')).toHaveCSS('color', 'rgb(192, 0, 0)')
  await expect(page.locator('td[data-cell="1:5"]')).toHaveCSS('text-align', 'center')
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.fill('J2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:9"]')).toHaveCSS('vertical-align', 'top')
  await nameBox.fill('K2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:10"] .cell-rotated-text')).toHaveAttribute(
    'style',
    /rotate\(45deg\)/,
  )
  await nameBox.fill('L2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:11"]')).toHaveCSS('border-top-style', 'solid')
})
