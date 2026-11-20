import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile } from '../support/conditional-dates'
import { diagonalCell as cell, diagonalButton as button, diagonalLines, diagonalWorkbook,
  openDiagonal, applyDiagonal } from '../support/diagonal-borders'

test('pending diagonal Apply keeps its draft and prevents duplicate writes until the native reply', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Reflect.set(window, 'releaseDiagonal', () => release())
    Worker.prototype.postMessage = function (message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions) {
      const send = () => post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'format.setRange') release = send
      else send()
    }
  })
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, diagonalWorkbook); await select(page, 'B2:C3', '1:1')
  await openDiagonal(page, 'diagonal', 'double', '#123abc'); await button(page, 'Apply borders').click()
  await expect(button(page, 'Apply borders')).toBeDisabled(); await expect(button(page, 'Cancel')).toBeDisabled()
  await expect(page.getByLabel('Position', { exact: true })).toBeDisabled()
  await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
  await page.evaluate(() => Reflect.get(window, 'releaseDiagonal')())
  await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
  for (const coord of ['1:1', '1:2', '2:1', '2:2']) await expect(diagonalLines(cell(page, coord))).toHaveCount(4)
  await button(page, 'Undo').click(); await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('rejected diagonal Apply retains editable fields and retries with exactly one undo', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 })
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let reject = true
    Worker.prototype.postMessage = function (message: { command?: string; payload?: { request: { sheetId: string } } },
      options?: Transferable[] | StructuredSerializeOptions) {
      if (reject && message.command === 'format.setRange' && message.payload) {
        reject = false
        message = { ...message, payload: { ...message.payload,
          request: { ...message.payload.request, sheetId: 'missing-diagonal-sheet' } } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, diagonalWorkbook); await select(page, 'B2', '1:1')
  await openDiagonal(page, 'diagonal-up', 'dotted', '#123abc'); await button(page, 'Apply borders').click()
  const dialog = page.getByRole('dialog', { name: 'Borders', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('Could not confirm the borders')
  await expect(page.getByLabel('Position', { exact: true })).toHaveValue('diagonal-up')
  await expect(page.getByLabel('Hex color', { exact: true })).toHaveValue('#123abc')
  await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
  await info.attach('diagonal-rejected-390.png', { body: await page.screenshot(), contentType: 'image/png' })
  await applyDiagonal(page)
  await expect(cell(page, '1:1').locator('[data-diagonal="diagUp"]')).toHaveAttribute('stroke', '#123abc')
  await button(page, 'Undo').click(); await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
