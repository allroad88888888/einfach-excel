import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openProtection, protect, closeProtection } from '../protection/support'
import { applyBaseline, baselineButton as button, baselineCell as cell, startBaseline } from '../support/font-baseline'

test('protected folded baseline errors stay visible in Chinese and retry as one undoable action', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/?locale=zh')
  const target = cell(page, '1:1')
  await expect(target).toHaveText('Acme Co.')
  const name = page.getByRole('textbox', { name: '名称框', exact: true })
  await name.fill('B2'); await name.press('Enter')
  await showRibbonItem(page, 'data.worksheet-protection')
  await button(page, '工作表保护').click()
  await button(page, '保护工作表').click(); await button(page, '关闭').click()
  await showRibbonItem(page, 'format.superscript')
  await button(page, '上标').focus(); await page.keyboard.press('Enter')
  const error = page.locator('.font-baseline-feedback')
  await expect(error).toHaveCount(1)
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.locator('[data-ribbon-more]')).toHaveAttribute('aria-expanded', 'true')
  await expect(error).toBeVisible()
  await expect(button(page, '上标')).toBeEnabled()
  await expect(button(page, '撤销')).toBeDisabled()
  await expect(target.locator('[data-font-baseline]')).toHaveCount(0)
  const bounds = (await error.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('font-baseline-blocked-zh-390.png') })
  await button(page, '关闭字体错误提示').focus(); await page.keyboard.press('Enter')
  await expect(error).toHaveCount(0)
  await showRibbonItem(page, 'data.worksheet-protection')
  await button(page, '工作表保护').click()
  await button(page, '取消工作表保护').click(); await button(page, '关闭').click()
  await showRibbonItem(page, 'format.superscript')
  await button(page, '上标').focus(); await page.keyboard.press('Enter')
  await expect(target.locator('[data-font-baseline="superscript"]')).toHaveText('Acme Co.')
  await expect(name).toHaveValue('B2')
  await button(page, '撤销').click()
  await expect(target.locator('[data-font-baseline]')).toHaveCount(0)
  await expect(button(page, '撤销')).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('failed folded baseline command exposes its error and retries with one undo at 390px', async ({ page }, info) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let rejectOnce = true
    Worker.prototype.postMessage = function (
      message: { command?: string; payload?: { request: { sheetId: string } } },
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (rejectOnce && message.command === 'format.setRange' && message.payload) {
        rejectOnce = false
        message = { ...message, payload: { ...message.payload,
          request: { ...message.payload.request, sheetId: 'missing-baseline-sheet' } } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await startBaseline(page, 390)
  await select(page, 'B2', '1:1')
  await applyBaseline(page, 'Superscript')
  const alert = page.getByRole('alert').filter({ hasText: 'Could not confirm the font change' })
  await expect(alert).toBeVisible()
  await expect(page.locator('[data-ribbon-more]')).toHaveAttribute('aria-expanded', 'true')
  await expect(button(page, 'Superscript')).toBeEnabled()
  await expect(button(page, 'Undo')).toBeDisabled()
  const box = (await alert.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('font-baseline-error-390.png') })
  await applyBaseline(page, 'Superscript')
  await expect(cell(page, '1:1').locator('[data-font-baseline="superscript"]')).toBeVisible()
  await expect(alert).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(cell(page, '1:1').locator('[data-font-baseline]')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('editing blocks both baseline buttons without committing the draft', async ({ page }) => {
  await startBaseline(page)
  await select(page, 'B2', '1:1')
  await cell(page, '1:1').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Uncommitted')
  await showRibbonItem(page, 'format.superscript')
  await expect(button(page, 'Superscript')).toBeDisabled()
  await expect(button(page, 'Subscript')).toBeDisabled()
  await editor.press('Escape')
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('protected selection rejects baseline formatting and succeeds after unprotecting', async ({ page }) => {
  await startBaseline(page)
  await select(page, 'B2', '1:1')
  await openProtection(page); await protect(page); await closeProtection(page)
  await applyBaseline(page, 'Superscript')
  await expect(page.getByRole('alert').filter({ hasText: /editable range|Could not confirm the font change/ })).toBeVisible()
  await expect(cell(page, '1:1').locator('[data-font-baseline]')).toHaveCount(0)
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(button(page, 'Undo')).toBeDisabled()
  await openProtection(page)
  await button(page, 'Unprotect worksheet').click(); await closeProtection(page)
  await applyBaseline(page, 'Superscript')
  await expect(cell(page, '1:1').locator('[data-font-baseline="superscript"]')).toBeVisible()
  await button(page, 'Undo').click()
  await expect(cell(page, '1:1').locator('[data-font-baseline]')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
