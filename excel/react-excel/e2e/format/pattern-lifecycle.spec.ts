import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile } from '../support/conditional-dates'
import { patternCell as cell, patternButton as button, patternWorkbook, openPattern, applyPattern,
  expectPattern } from '../support/pattern-fill'

for (const mode of ['pending', 'rejected'] as const)
  test(`${mode} pattern Apply retains the draft and completes with exactly one native undo`, async ({ page }) => {
    await page.addInitScript(mode => {
      const post = Worker.prototype.postMessage
      let first = true, release = () => {}
      Reflect.set(window, 'releasePattern', () => release())
      Worker.prototype.postMessage = function (message: { command?: string; payload?: { request: { sheetId: string } } },
        options?: Transferable[] | StructuredSerializeOptions) {
        const send = () => post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
        if (first && message.command === 'format.setRange' && message.payload) {
          first = false
          if (mode === 'pending') { release = send; return }
          message = { ...message, payload: { ...message.payload,
            request: { ...message.payload.request, sheetId: 'missing-pattern-sheet' } } }
        }
        send()
      }
    }, mode)
    await page.goto('/?plugins=cell-appearance')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await openFile(page, patternWorkbook); await select(page, 'B2:C3', '1:1')
    await openPattern(page, 'lightUp', '#c00000', '#fff2cc'); await button(page, 'Apply fill').click()
    if (mode === 'pending') {
      await expect(button(page, 'Apply fill')).toBeDisabled(); await expect(button(page, 'Cancel')).toBeDisabled()
      await expect(page.getByLabel('Pattern', { exact: true })).toBeDisabled()
      await expect(page.getByLabel('Pattern color')).toBeDisabled()
    } else {
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText('could not be confirmed')
      await expect(page.getByLabel('Pattern', { exact: true })).toHaveValue('lightUp')
      await expect(page.getByLabel('Background color')).toHaveValue('#fff2cc')
    }
    await expectPattern(page, '1:1'); await expect(button(page, 'Undo')).toBeDisabled()
    if (mode === 'pending') {
      await page.evaluate(() => Reflect.get(window, 'releasePattern')())
      await expect(page.getByRole('dialog', { name: 'Pattern fill' })).toHaveCount(0)
    } else await applyPattern(page)
    for (const coord of ['1:1', '1:2', '2:1', '2:2']) await expectPattern(page, coord, 'lightUp')
    await button(page, 'Undo').click()
    for (const coord of ['1:1', '1:2', '2:1', '2:2']) await expectPattern(page, coord)
    await expect(button(page, 'Undo')).toBeDisabled()
  })
