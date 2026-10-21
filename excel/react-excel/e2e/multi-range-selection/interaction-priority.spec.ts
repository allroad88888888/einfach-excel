import { expect, test } from '@playwright/test'
import { cell, drag, expectSelected, nameBox, openOrders } from './pointer'

for (const width of [1280, 390]) {
  test(`Shift extends the primary anchor after manual multi-selection at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    await cell(page, 5, 0).click({ modifiers: ['Meta'] })
    await cell(page, 7, 1).click({ modifiers: ['Meta', 'Shift'] })
    await expect(nameBox(page)).toHaveValue('A6:B8')
    await expectSelected(page, 2, 0, false)
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(6)
  })

  test(`formula reference picking keeps priority over modifier append at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    await cell(page, 5, 0).click({ modifiers: ['Meta'] })
    const editor = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await editor.fill('=SUM(')
    await drag(page, [1, 0], [2, 0], 'Meta')
    await expect(editor).toHaveValue('=SUM(A2:A3')
    await expect(editor).toBeFocused()
    await expect(nameBox(page)).toHaveValue('A6')
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true }))
      .toContainText('2 cells selected in multiple areas')
    await editor.press('Escape')
    await expect(editor).toHaveValue('SO-10005')
    await expect(cell(page, 5, 0)).toHaveText('SO-10005')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })

  test(`format painter uses one continuous target during modifier drag at ${width}px`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openOrders(page, width)
    await cell(page, 1, 0).click()
    const brush = page.getByRole('button', { name: 'Format painter', exact: true })
    await brush.click()
    await expect(brush).toHaveAttribute('data-painter-mode', 'armed')
    await expect(brush).toHaveAttribute('aria-busy', 'false')
    await drag(page, [5, 0], [6, 1], 'Meta')
    await expect(brush).toHaveAttribute('data-painter-mode', 'idle')
    await expect(nameBox(page)).toHaveValue('A6:B7')
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true })).toHaveCount(0)
    await expect(cell(page, 5, 1)).toHaveCSS('font-weight', '700')
    await expect(cell(page, 4, 0)).toHaveCSS('font-weight', '400')
  })

  test(`Ctrl or Command hyperlink opening keeps existing manual areas at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    await cell(page, 5, 0).click({ modifiers: ['Meta'] })
    await page.route('https://example.com/**', route => route.fulfill({ body: 'Link destination' }))
    const opened = page.waitForEvent('popup')
    await cell(page, 2, 1).click({ modifiers: ['ControlOrMeta'] })
    const popup = await opened
    await expect(popup).toHaveURL('https://example.com/customers/northwind')
    await popup.close()
    await expect(nameBox(page)).toHaveValue('A6')
    await expectSelected(page, 2, 0)
    await expectSelected(page, 5, 0)
    await expectSelected(page, 2, 1, false)
  })
}
