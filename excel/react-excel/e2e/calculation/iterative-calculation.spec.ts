import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test('iterative calculation converges circular formulas and respects maxIterations / maxChange', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/base-sales-orders/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')

  // Create a blank sheet so we have clean cells D1, E1, F1
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')

  const toggle = page.getByTestId('iterative-calculation-toggle')
  const maxIterInput = page.getByTestId('iterative-max-iterations')
  const maxChangeInput = page.getByTestId('iterative-max-change')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  const editor = page.getByRole('textbox', { name: 'Active cell value' })

  // Set maxIterations = 5 and enable iterative calculation -> D1 converges to 5
  const cellD1 = page.locator('td[data-cell="0:3"]')
  await maxIterInput.fill('5')
  await maxIterInput.press('Enter')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await select(page, 'D1', '0:3')
  await editor.fill('=D1+1')
  await editor.press('Enter')
  await expect(cellD1).toHaveText('5')

  // Disable iterative calculation -> D1 returns to #CYCLE!
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(cellD1).toHaveText('#CYCLE!')

  // Re-enable with maxIterations = 100 and maxChange = 0.001, then enter a 2-cell cycle in E1/F1
  await maxIterInput.fill('100')
  await maxIterInput.press('Enter')
  await maxChangeInput.fill('0.001')
  await maxChangeInput.press('Enter')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(cellD1).toHaveText('100')

  const cellE1 = page.locator('td[data-cell="0:4"]')
  const cellF1 = page.locator('td[data-cell="0:5"]')
  await select(page, 'E1', '0:4')
  await editor.fill('=ROUND(F1*0.25, 2)')
  await editor.press('Enter')

  await select(page, 'F1', '0:5')
  await editor.fill('=ROUND(100-E1, 2)')
  await editor.press('Enter')

  await expect(cellE1).toHaveText('20')
  await expect(cellF1).toHaveText('80')
})
