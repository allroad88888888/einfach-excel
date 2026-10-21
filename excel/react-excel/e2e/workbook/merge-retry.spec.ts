import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 已确认的发送被拒绝后，必须保留原值并重新征求确认，不能沿用失效的 discard 授权。
for (const width of [1280, 390])
  test(`confirmed merge transport failure requires a fresh confirmation and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await select(page, 'B2:C3', '1:1')
    const coords = ['1:1', '1:2', '2:1', '2:2', '1:3']
    const values = await Promise.all(coords.map(coord => page.locator(`td[data-cell="${coord}"]`).innerText()))
    await page.evaluate(() => {
      const post = Worker.prototype.postMessage
      let fail = true
      Worker.prototype.postMessage = function (
        message: { command?: string; payload?: { discard?: boolean } },
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (fail && message.command === 'range.merge' && message.payload?.discard) {
          fail = false
          throw new Error('Merge transport unavailable')
        }
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      }
    })
    const menu = page.getByRole('combobox', { name: 'Merge cells', exact: true })
    await menu.selectOption('merge')
    const dialog = page.getByRole('alertdialog', { name: 'Merge these cells?', exact: true })
    const confirm = dialog.getByRole('button', { name: 'Merge cells', exact: true })
    const merged = page.locator('[data-merged-cell][data-cell="1:1"]')
    await confirm.click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveText('Merge transport unavailable')
    await expect(menu).toBeFocused()
    await expect(menu).toBeEnabled()
    await expect(merged).toHaveCount(0)
    for (const [index, coord] of coords.entries())
      await expect(page.locator(`td[data-cell="${coord}"]`)).toHaveText(values[index]!)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await menu.selectOption('merge')
    await expect(dialog).toBeVisible()
    await expect(merged).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await confirm.click()
    await expect(dialog).toHaveCount(0)
    await expect(merged).toHaveText('Acme Co.')
    await expect(merged).toHaveAttribute('aria-rowspan', '2')
    await expect(merged).toHaveAttribute('aria-colspan', '2')
    await expect(page.locator('td[data-cell="1:3"]')).toHaveText(values[4]!)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(merged).toHaveCount(0)
    for (const [index, coord] of coords.entries())
      await expect(page.locator(`td[data-cell="${coord}"]`)).toHaveText(values[index]!)
    await expect(page.locator('td[data-cell="1:1"]')).toHaveCSS('font-style', 'italic')
    await expect(page.locator('td[data-cell="1:2"]')).toHaveCSS('text-decoration-line', 'underline')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(merged).toHaveText('Acme Co.')
    await expect(page.locator('td[data-cell="1:3"]')).toHaveText(values[4]!)
  })
