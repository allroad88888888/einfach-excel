import { expect, test } from '@playwright/test'
import {
  specialButton as button, specialCell as cell, specialFormula as formula,
  applySpecial, openSpecial, setSpecialInput, startSpecial,
} from '../support/special-number-format'

test('auto-fit measures the Rust special display without resizing the neighboring column', async ({ page }) => {
  await startSpecial(page)
  await setSpecialInput(page, 'A40', '39:0', '123456789012345')
  await openSpecial(page, 'A40', '39:0', 'phone-us')
  await applySpecial(page)
  await expect(cell(page, '39:0')).toHaveText('(12345678) 901-2345')
  const handle = page.getByRole('separator', { name: 'Resize column A', exact: true })
  const adjacent = page.getByRole('separator', { name: 'Resize column B', exact: true })
  const before = await handle.getAttribute('aria-valuenow')
  const neighbor = await adjacent.getAttribute('aria-valuenow')
  await handle.press('Enter')
  await expect(handle).not.toHaveAttribute('aria-valuenow', before!)
  const after = await handle.getAttribute('aria-valuenow')
  const dimensions = await cell(page, '39:0').locator('.cell-content').evaluate(node => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    context.font = getComputedStyle(node).font
    return { available: node.clientWidth, needed: context.measureText(node.textContent!).width }
  })
  expect(dimensions.available).toBeGreaterThanOrEqual(Math.floor(dimensions.needed))
  await expect(adjacent).toHaveAttribute('aria-valuenow', neighbor!)
  await expect(formula(page)).toHaveValue('123456789012345')
  await button(page, 'Undo').click()
  await expect(handle).toHaveAttribute('aria-valuenow', before!)
  await button(page, 'Redo').click()
  await expect(handle).toHaveAttribute('aria-valuenow', after!)
})
