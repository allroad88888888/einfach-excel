import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 仅扣住真实 Worker 的下一次窗口读取，稳定重现 resize 与快捷键交错。
for (const direction of ['undo', 'redo']) for (const width of [1280, 390])
test(`${direction} during resize is not discarded at ${width}px`, async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let armed = false
    let release: (() => void) | null = null
    Object.defineProperties(window, {
      holdHistoryResize: { value: () => { armed = true } },
      releaseHistoryResize: { value: () => { const send = release; release = null; send?.() } },
    })
    Worker.prototype.postMessage = function (
      message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () => post.call(this, message,
        Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (armed && message.command === 'projection.readVisible') {
        armed = false
        release = send
      } else send()
    }
  })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  const cell = page.locator('td[data-cell="2:1"]')
  await expect(cell).toHaveText('Northwind')
  await select(page, 'B3', '2:1')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Resize edit'); await input.press('Enter')
  await expect(cell).toHaveText('Resize edit')
  if (direction === 'redo') {
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell).toHaveText('Northwind')
  }
  await page.evaluate(() => Reflect.get(window, 'holdHistoryResize')())
  await page.setViewportSize({ width, height: 650 })
  const grid = page.locator('[data-workbook-grid]')
  await expect(grid).toHaveAttribute('data-projection-retained', 'true')
  await grid.press(direction === 'undo' ? 'Control+z' : 'Control+y')
  await page.evaluate(() => Reflect.get(window, 'releaseHistoryResize')())
  await expect(grid).toHaveAttribute('data-projection-retained', 'false')
  await expect(cell).toHaveText(direction === 'undo' ? 'Northwind' : 'Resize edit')
  await expect(page.locator('td[data-cell="1:1"]')).toHaveText('Acme Co.')
  await expect(page.locator('td[data-cell="1:1"]')).toHaveCSS('font-style', 'italic')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled({ enabled: direction === 'redo' })
  await page.getByRole('button', { name: direction === 'undo' ? 'Redo' : 'Undo', exact: true }).click()
  await expect(cell).toHaveText(direction === 'undo' ? 'Resize edit' : 'Northwind')
})
