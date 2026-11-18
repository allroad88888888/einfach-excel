import { expect, test } from '@playwright/test'
import { openProtection, protect, closeProtection } from '../protection/support'
import { start, open, selectText, text, dialog, button, save, cell, go } from '../support/rich-baseline'

for (const fault of ['target', 'revision'] as const) {
  test(`native ${fault} rejection keeps inline draft available for a single successful retry`, async ({ page }) => {
    await page.addInitScript(mode => {
      const post = Worker.prototype.postMessage
      let first = true
      Worker.prototype.postMessage = function (
        message: { command?: string; payload?: { sheetId: string; revision: number } },
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (first && message.command === 'richText.change' && message.payload) {
          first = false
          const patch = mode === 'target' ? { sheetId: 'missing-rich-sheet' }
            : { revision: message.payload.revision + 100 }
          message = { ...message, payload: { ...message.payload, ...patch } }
        }
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      }
    }, fault)
    await start(page); await open(page, 'D9'); await selectText(text(page), 1, 1)
    await button(dialog(page), 'Superscript').click()
    await button(dialog(page), 'Save changes').click()
    await expect(dialog(page).getByRole('alert')).toContainText(
      fault === 'target' ? 'Invalid rich text projection request' : 'The workbook changed')
    await expect(text(page)).toHaveValue('H2O')
    await expect(button(dialog(page), 'Superscript')).toHaveAttribute('aria-pressed', 'true')
    await expect(cell(page, '8:3').locator('[data-font-baseline="subscript"]')).toHaveText('2')
    await save(page)
    await expect(cell(page, '8:3').locator('[data-font-baseline="superscript"]')).toHaveText('2')
    await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
    await expect(cell(page, '8:3').locator('[data-font-baseline="subscript"]')).toHaveText('2')
  })
}

test('pending inline save disables editing and cancellation until the actual Worker response', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message: { command?: string },
      options?: Transferable[] | StructuredSerializeOptions) {
      const send = () => post.call(this, message,
        Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'richText.change')
        window.addEventListener('release-rich-write', send, { once: true })
      else send()
    }
  })
  await start(page); await open(page, 'D9'); await selectText(text(page), 1, 1)
  await button(dialog(page), 'Superscript').click(); await button(dialog(page), 'Save changes').click()
  await expect(dialog(page).getByRole('status')).toHaveText('Saving rich text…')
  for (const name of ['Superscript', 'Subscript', 'Save changes', 'Cancel'])
    await expect(button(dialog(page), name)).toBeDisabled()
  await expect(text(page)).toBeDisabled(); await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('release-rich-write')))
  await expect(dialog(page)).toHaveCount(0)
  await expect(cell(page, '8:3').locator('[data-font-baseline="superscript"]')).toHaveText('2')
  await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
})

test('protected cells reject local baseline save and work after protection is removed', async ({ page }) => {
  await start(page); await go(page, 'D9')
  await openProtection(page); await protect(page); await closeProtection(page)
  await open(page, 'D9'); await selectText(text(page), 1, 1)
  await button(dialog(page), 'Superscript').click(); await button(dialog(page), 'Save changes').click()
  await expect(dialog(page).getByRole('alert')).toContainText(/protected|locked/i)
  await expect(text(page)).toHaveValue('H2O')
  await button(dialog(page), 'Cancel').click()
  await expect(cell(page, '8:3').locator('[data-font-baseline="subscript"]')).toHaveText('2')
  await openProtection(page); await button(page, 'Unprotect worksheet').click(); await closeProtection(page)
  await open(page, 'D9'); await selectText(text(page), 1, 1)
  await button(dialog(page), 'Superscript').click(); await save(page)
  await expect(cell(page, '8:3').locator('[data-font-baseline="superscript"]')).toHaveText('2')
})
