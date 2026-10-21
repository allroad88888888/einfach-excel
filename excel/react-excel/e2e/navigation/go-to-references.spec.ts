import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

const targets = [
  { kind: 'absolute A1', reference: '$B$3:$D$5', selection: 'B3:D5', coord: '2:1', value: 'Northwind' },
  { kind: 'relative R1C1', reference: 'R[2]C[-1]', selection: 'C6', coord: '5:2', value: 'North' },
  { kind: 'quoted cross-sheet', reference: "'Sales Orders'!B2", selection: 'B2', coord: '1:1', value: 'Acme Co.' },
] as const

for (const width of [1280, 390]) for (const target of targets)
  test(`Go button submits ${target.kind} without changing data or history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    if (target.kind === 'quoted cross-sheet')
      await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'D4', '3:3')
    await button('Go to').click()
    await page.getByRole('textbox', { name: 'Reference', exact: true }).fill(target.reference)
    await button('Go').click()
    await expect(page.getByRole('dialog', { name: 'Go to', exact: true })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(target.selection)
    await expect(cell(target.coord)).toHaveText(target.value)
    await expect(cell(target.coord)).toHaveAttribute('data-selected', 'true')
    await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Sales Orders', exact: true }))
      .toHaveAttribute('aria-selected', 'true')
    await expect(button('Undo')).toBeDisabled()
    await expect(button('Redo')).toBeDisabled()
    await button('Go to').click()
    await expect(page.getByRole('region', { name: 'Recent locations' }).getByRole('button'))
      .toHaveText(`'Sales Orders'!${target.selection}`)
    await button('Cancel').click()
    await select(page, 'A2', '1:0')
    await expect(cell('1:0')).toHaveText('SO-10001')
    await expect(cell('1:0')).toHaveCSS('font-weight', '700')
    await expect(cell('2:0')).toHaveText('SO-10002')
    await expect(button('Undo')).toBeDisabled()
  })
