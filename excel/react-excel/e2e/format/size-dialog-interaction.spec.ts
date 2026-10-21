import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

// 尺寸弹窗的键盘循环与一次真实发送失败后的原地重试。
for (const width of [1280, 390]) test.describe(`${width}px size interaction`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B2', '1:1')
  })

  for (const key of ['Tab', 'Shift+Tab'])
    test(`${key} size dialog cycles focus without writing at ${width}px`, async ({ page }, info) => {
      const opener = page.getByRole('button', { name: 'Row and column size', exact: true })
      await opener.click()
      const dialog = page.getByRole('dialog', { name: 'Row and column size', exact: true })
      const first = dialog.getByRole('spinbutton', { name: 'Row height' })
      const last = dialog.getByRole('button', { name: 'Cancel', exact: true })
      await first.fill('44')
      await (key === 'Tab' ? last : first).focus()
      await page.keyboard.press(key)
      await expect(key === 'Tab' ? first : last).toBeFocused()
      await expect(first).toHaveValue('44')
      if (key === 'Tab') await page.screenshot({ path: info.outputPath(`size-dialog-${width}.png`) })
      await last.click()
      await expect(dialog).toHaveCount(0)
      await expect(opener).toBeFocused()
      await expect(page.getByRole('separator', { name: 'Resize row 2', exact: true }))
        .toHaveAttribute('aria-valuenow', '28')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    })

  test(`size transport failure retries the same draft with one undo at ${width}px`, async ({ page }) => {
    await page.evaluate(() => {
      const post = Worker.prototype.postMessage
      let fail = true
      Worker.prototype.postMessage = function (
        message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (fail && message.command === 'range.resize') {
          fail = false
          throw new Error('Size transport unavailable')
        }
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      }
    })
    const handle = page.getByRole('separator', { name: 'Resize row 2', exact: true })
    const neighbor = (await cell(page, '2:2').boundingBox())!.height
    await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Row and column size', exact: true })
    const input = dialog.getByRole('spinbutton', { name: 'Row height' })
    await input.fill('44')
    await dialog.getByRole('button', { name: 'Set row height', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Size transport unavailable')
    await expect(input).toHaveValue('44')
    await expect(input).toBeEnabled()
    await expect(handle).toHaveAttribute('aria-valuenow', '28')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Set row height', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(handle).toHaveAttribute('aria-valuenow', '44')
    expect((await cell(page, '2:2').boundingBox())!.height).toBe(neighbor)
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(handle).toHaveAttribute('aria-valuenow', '28')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(handle).toHaveAttribute('aria-valuenow', '44')
  })
})
