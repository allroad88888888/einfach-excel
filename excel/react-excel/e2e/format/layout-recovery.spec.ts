import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390])
  test(`dismiss layout error preserves native format formula and redo at ${width}px`, async ({ page }) => {
    await page.addInitScript(() => {
      const post = Worker.prototype.postMessage
      let rejectOnce = true
      Worker.prototype.postMessage = function (
        message: { command?: string; payload?: { request: { sheetId: string } } },
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (rejectOnce && message.command === 'format.setRange' && message.payload) {
          rejectOnce = false
          message = { ...message, payload: {
            ...message.payload, request: { ...message.payload.request, sheetId: 'missing-layout-sheet' },
          } }
        }
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      }
    })
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('2')
    await bar.press('Enter')
    await expect(cell('1:6')).toHaveText('158')
    await button('Undo').click()
    await select(page, 'G2', '1:6')
    const before = await cell('1:6').evaluate(node => getComputedStyle(node).textAlign)
    const alignment = page.getByRole('combobox', { name: 'Horizontal alignment', exact: true })
    await alignment.selectOption('center')
    const error = page.locator('.text-layout-error')
    await expect(error).toContainText('Check the cell before retrying')
    await expect(cell('1:6')).toHaveCSS('text-align', before)
    await button('Dismiss layout error').click()
    await expect(error).toHaveCount(0)
    await expect(button('Undo')).toBeDisabled()
    await expect(button('Redo')).toBeEnabled()
    await expect(bar).toHaveValue('=E2*F2')
    await expect(cell('1:6')).toHaveText('79')
    await expect(cell('1:6')).toHaveCSS('font-family', 'Georgia')
    await expect(cell('1:5')).toHaveText('79')
    await button('Redo').click()
    await expect(cell('1:6')).toHaveText('158')
    await alignment.selectOption('center')
    await expect(cell('1:6')).toHaveCSS('text-align', 'center')
    await button('Undo').click()
    await expect(cell('1:6')).toHaveCSS('text-align', before)
    await expect(cell('1:6')).toHaveText('158')
    await button('Undo').click()
    await expect(button('Undo')).toBeDisabled()
    await expect(cell('1:6')).toHaveText('79')
  })
