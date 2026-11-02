import { expect, test } from '@playwright/test'

test('iterative calculation converges circular formulas and respects maxIterations / maxChange', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-cell="0:0"]')).toBeVisible()

  await page.getByRole('tab', { name: 'Formulas', exact: true }).click()
  const toggle = page.getByTestId('iterative-calculation-toggle')
  const maxIterInput = page.getByTestId('iterative-max-iterations')
  const maxChangeInput = page.getByTestId('iterative-max-change')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  // Enter a self-referential formula in D1 (row 0, col 3) while iterative calculation is off
  const cellD1 = page.locator('[data-cell="0:3"]')
  await cellD1.dblclick()
  const editor = page.getByRole('textbox', { name: 'Formula bar' })
  await editor.fill('=D1+1')
  await editor.press('Enter')
  await expect(cellD1).toHaveText('#CYCLE!')

  // Set maxIterations = 5 and enable iterative calculation -> D1 converges to 5
  await maxIterInput.fill('5')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(cellD1).toHaveText('5')

  // Disable iterative calculation -> D1 returns to #CYCLE!
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(cellD1).toHaveText('#CYCLE!')

  // Re-enable with maxIterations = 100 and maxChange = 0.001, then enter a 2-cell cycle in E1/F1
  await maxIterInput.fill('100')
  await maxChangeInput.fill('0.001')
  await toggle.click()
  const cellE1 = page.locator('[data-cell="0:4"]')
  const cellF1 = page.locator('[data-cell="0:5"]')
  await cellE1.dblclick()
  await editor.fill('=ROUND(F1*0.5, 2)')
  await editor.press('Enter')
  await cellF1.dblclick()
  await editor.fill('=ROUND(100-E1, 2)')
  await editor.press('Enter')
  await expect(cellE1).toHaveText('33.33')
  await expect(cellF1).toHaveText('66.67')
})
