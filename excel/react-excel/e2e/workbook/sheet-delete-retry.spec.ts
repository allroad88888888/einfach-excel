import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 在真实 Worker 发送前拒绝一次，重试不伪造任何原生删除或历史结果。
for (const width of [1280, 390])
  test(`delete transport failure retries in the same confirmation with one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await select(page, 'H2', '1:7')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await bar.fill('Keep delete retry redo')
    await bar.press('Enter')
    await expect(page.locator('td[data-cell="1:7"]')).toHaveText('Keep delete retry redo')
    await undo.click()
    await select(page, 'B2', '1:1')
    await page.evaluate(() => {
      const post = Worker.prototype.postMessage
      let fail = true
      Worker.prototype.postMessage = function (
        message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (fail && message.command === 'workbook.changeSheets') {
          fail = false
          throw new Error('Delete transport unavailable')
        }
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      }
    })
    await page.getByRole('button', { name: 'Delete sheet', exact: true }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Delete worksheet?', exact: true })
    const confirm = dialog.getByRole('button', { name: 'Delete worksheet', exact: true })
    await confirm.click()
    await expect(dialog.getByRole('alert')).toHaveText('Delete transport unavailable')
    await expect(confirm).toBeEnabled()
    await expect(dialog).toContainText('Sales Orders')
    const tabs = page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')
    await expect(tabs).toHaveText(['Sales Orders', 'Summary'])
    await expect(page.locator('td[data-cell="1:1"]')).toHaveText('Acme Co.')
    await expect(page.locator('td[data-cell="1:1"]')).toHaveCSS('font-style', 'italic')
    await expect(undo).toBeDisabled()
    await expect(redo).toBeEnabled()
    await confirm.click()
    await expect(dialog).toHaveCount(0)
    await expect(tabs).toHaveText(['Summary'])
    await select(page, 'B1', '0:1')
    await expect(page.locator('td[data-cell="0:1"]')).toHaveText('#REF!')
    await undo.click()
    await expect(tabs).toHaveText(['Sales Orders', 'Summary'])
    await expect(page.locator('td[data-cell="0:1"]')).toHaveText('79')
    await expect(undo).toBeDisabled()
    await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
    await select(page, 'A2', '1:0')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveCSS('font-weight', '700')
    await expect(page.locator('td[data-cell="1:1"]')).toHaveCSS('font-style', 'italic')
    await redo.click()
    await expect(tabs).toHaveText(['Summary'])
    await select(page, 'B1', '0:1')
    await expect(page.locator('td[data-cell="0:1"]')).toHaveText('#REF!')
  })
