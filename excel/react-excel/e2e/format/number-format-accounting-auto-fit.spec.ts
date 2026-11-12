import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  accountingButton as button, accountingCell as cell, accountingFormula as formula,
  applyAccounting, expectAccounting, openAccounting, setAccountingInput, startAccounting,
} from '../support/accounting-number-format'

test('accounting auto-fit includes symbol and parenthesis padding without resizing the neighboring column', async ({ page }) => {
  await startAccounting(page)
  await setAccountingInput(page, 'A40', '39:0', '-1234567890.5')
  await openAccounting(page, 'A40', '39:0', 'USD')
  await applyAccounting(page)
  const handle = page.getByRole('separator', { name: 'Resize column A', exact: true })
  const adjacent = page.getByRole('separator', { name: 'Resize column B', exact: true })
  const before = await handle.getAttribute('aria-valuenow')
  const neighbor = await adjacent.getAttribute('aria-valuenow')
  await handle.press('Enter')
  await expect(handle).not.toHaveAttribute('aria-valuenow', before!)
  const after = await handle.getAttribute('aria-valuenow')
  expect(Number(after)).toBeGreaterThan(Number(before))
  await select(page, 'A40', '39:0')
  await expectAccounting(cell(page, '39:0'), 'USD', '(1,234,567,890.50)')
  const dimensions = await cell(page, '39:0').evaluate(node => {
    const start = node.querySelector('.cell-fill-start')!.getBoundingClientRect()
    const end = node.querySelector('.cell-fill-end')!.getBoundingClientRect()
    return { gap: end.x - start.x - start.width }
  })
  expect(dimensions.gap).toBeGreaterThanOrEqual(0)
  await expect(adjacent).toHaveAttribute('aria-valuenow', neighbor!)
  await expect(formula(page)).toHaveValue('-1234567890.5')
  await button(page, 'Undo').click()
  await expect(handle).toHaveAttribute('aria-valuenow', before!)
  await button(page, 'Redo').click()
  await expect(handle).toHaveAttribute('aria-valuenow', after!)
})
