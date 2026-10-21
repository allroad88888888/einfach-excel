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

for (const [kind, label, address, coord, before, after, raw, neighborCoord, neighborText] of [
  ['percent', 'Percent format', 'O3', '2:14', '5%', '0.05', '0.05', '3:14', '10.00%'],
  ['currency', 'Currency format', 'P2', '1:15', '$15.80', '15.8', '15.8', '2:15', '$125'],
  ['thousands', 'Thousands format', 'G9', '8:6', '2,632.00', '2632', '=E9*F9', '9:6', '1341'],
] as const) test(`${kind} format is stored and rendered through Rust`, async ({ page }) => {
  const cell = await navigateTo(page, address, coord)
  const button = page.getByRole('button', { name: label, exact: true })
  const neighbor = page.locator(`td[data-cell="${neighborCoord}"]`)
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  const weight = await cell.evaluate(node => getComputedStyle(node).fontWeight)
  await expect(cell).toHaveText(before)
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await button.click()
  await expect(cell).toHaveText(after)
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(formula).toHaveValue(raw)
  await expect(cell).toHaveCSS('font-weight', weight)
  await expect(neighbor).toHaveText(neighborText)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell).toHaveText(before)
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell).toHaveText(after)
  await expect(formula).toHaveValue(raw)
  await button.click()
  await expect(cell).toHaveText(before)
})
