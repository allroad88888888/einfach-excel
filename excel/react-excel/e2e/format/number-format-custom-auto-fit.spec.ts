import { expect, test, type Page } from '@playwright/test'
import {
  applyCustomFormat, customButton, customCell, customFormula,
  openCustomFormat, setCustomInput, startCustomFormat,
} from '../support/custom-number-format'

async function fitCustomColumn(page: Page) {
  const handle = page.getByRole('separator', { name: 'Resize column A', exact: true })
  const neighbor = page.getByRole('separator', { name: 'Resize column B', exact: true })
  const before = await handle.getAttribute('aria-valuenow')
  const adjacentWidth = await neighbor.getAttribute('aria-valuenow')
  await handle.press('Enter')
  await expect(handle).not.toHaveAttribute('aria-valuenow', before!)
  const after = await handle.getAttribute('aria-valuenow')
  const sizes = await customCell(page).locator('.cell-content').evaluate((node) => ({
    content: node.clientWidth,
    rendered: node.querySelector('.cell-number-text')!.getBoundingClientRect().width,
  }))
  expect(sizes.content, JSON.stringify(sizes)).toBeGreaterThanOrEqual(Math.floor(sizes.rendered))
  await expect(neighbor).toHaveAttribute('aria-valuenow', adjacentWidth!)
  await customButton(page, 'Undo').click()
  await expect(handle).toHaveAttribute('aria-valuenow', before!)
  await customButton(page, 'Redo').click()
  await expect(handle).toHaveAttribute('aria-valuenow', after!)
}

test.beforeEach(async ({ page }) => startCustomFormat(page))

test('auto-fit includes the actual width of custom padding characters', async ({ page }) => {
  await setCustomInput(page, '1234567890')
  await openCustomFormat(page, '_W_W_W_W_W0_W_W_W_W_W')
  await applyCustomFormat(page)
  await fitCustomColumn(page)
  await expect(customFormula(page)).toHaveValue('1234567890')
})

test('auto-fit measures custom text sections with their prefixes and padding', async ({ page }) => {
  await setCustomInput(page, 'hello')
  await openCustomFormat(page, '0;0;0;_W"Long text label: "@_W')
  await applyCustomFormat(page)
  await expect(customCell(page)).toHaveText('Long text label: hello', { useInnerText: true })
  await fitCustomColumn(page)
  await expect(customFormula(page)).toHaveValue('hello')
})
