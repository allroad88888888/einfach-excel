import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile } from '../support/conditional-dates'
import { baselineCell as cell, baselineButton as button } from '../support/font-baseline'
import { shrinkWorkbook } from '../support/shrink-workbook'
import { shrinkText, toggleShrink, expectShrinkFits } from '../support/shrink-to-fit'

test('Chinese shrink button works by keyboard at 390px and retries after protection is removed', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/?locale=zh&plugins=text-format')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  const name = page.getByRole('textbox', { name: '名称框', exact: true })
  await name.fill('B2'); await name.press('Enter')
  await showRibbonItem(page, 'data.worksheet-protection')
  await button(page, '工作表保护').click(); await button(page, '保护工作表').click()
  await button(page, '关闭').click()
  await showRibbonItem(page, 'format.shrink-to-fit')
  await button(page, '缩小字体填充').focus(); await page.keyboard.press('Enter')
  const error = page.getByRole('alert').filter({ hasText: '请选择可编辑区域' })
  await expect(error).toBeVisible()
  const box = (await error.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390)
  await expect(shrinkText(cell(page, '1:1'))).toHaveCount(0)
  await expect(button(page, '撤销')).toBeDisabled()
  await button(page, '关闭字体错误提示').click()
  await showRibbonItem(page, 'data.worksheet-protection')
  await button(page, '工作表保护').click(); await button(page, '取消工作表保护').click()
  await button(page, '关闭').click()
  await showRibbonItem(page, 'format.shrink-to-fit')
  await button(page, '缩小字体填充').focus(); await page.keyboard.press('Space')
  await expect(shrinkText(cell(page, '1:1'))).toHaveCount(1)
  await showRibbonItem(page, 'format.shrink-to-fit')
  await expect(button(page, '缩小字体填充')).toHaveAttribute('aria-pressed', 'true')
  await expect(name).toHaveValue('B2')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: info.outputPath('shrink-zh-keyboard.png') })
  await button(page, '撤销').click()
  await expect(shrinkText(cell(page, '1:1'))).toHaveCount(0)
  await expect(button(page, '撤销')).toBeDisabled()
})

test('pending shrink keeps the previous layout until one native transaction completes', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Reflect.set(window, 'releaseShrink', () => release())
    Worker.prototype.postMessage = function (message: { command?: string },
      options?: Transferable[] | StructuredSerializeOptions) {
      const send = () => post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'format.setRange') release = send
      else send()
    }
  })
  await page.goto('/?plugins=text-format')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  const source = JSON.parse(shrinkWorkbook.toString())
  source.workbook.formats[0].cellStyles.find((style: { addr: string }) => style.addr === 'C2')
    .format.shrinkToFit = false
  await openFile(page, Buffer.from(JSON.stringify(source))); await select(page, 'C2', '1:2')
  await toggleShrink(page)
  await expect(button(page, 'Shrink to fit')).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Applying text layout' })).toBeVisible()
  await expect(cell(page, '1:2')).toHaveCSS('white-space', 'pre-wrap')
  await expect(shrinkText(cell(page, '1:2'))).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
  await page.evaluate(() => Reflect.get(window, 'releaseShrink')())
  await expect(button(page, 'Shrink to fit')).toBeEnabled()
  await expect(button(page, 'Shrink to fit')).toHaveAttribute('aria-pressed', 'true')
  await expect(cell(page, '1:2')).toHaveCSS('white-space', 'nowrap')
  await expectShrinkFits(cell(page, '1:2'))
  await button(page, 'Undo').click()
  await expect(button(page, 'Shrink to fit')).toHaveAttribute('aria-pressed', 'false')
  await expect(cell(page, '1:2')).toHaveCSS('white-space', 'pre-wrap')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('rejected shrink can retry without changing wrapping or creating a failed undo entry', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let reject = true
    Worker.prototype.postMessage = function (message: {
      command?: string; payload?: { request: { sheetId: string } }
    }, options?: Transferable[] | StructuredSerializeOptions) {
      if (reject && message.command === 'format.setRange' && message.payload) {
        reject = false
        message = { ...message, payload: { ...message.payload,
          request: { ...message.payload.request, sheetId: 'missing-shrink-sheet' } } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await page.goto('/?plugins=text-format')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, shrinkWorkbook); await select(page, 'A1', '0:0')
  await toggleShrink(page)
  await expect(page.getByRole('alert')).toContainText('Could not confirm the text layout change')
  await expectShrinkFits(cell(page, '0:0'))
  await expect(button(page, 'Undo')).toBeDisabled()
  await toggleShrink(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(shrinkText(cell(page, '0:0'))).toHaveCount(0)
  await button(page, 'Undo').click()
  await expectShrinkFits(cell(page, '0:0'))
  await expect(button(page, 'Undo')).toBeDisabled()
  await cell(page, '0:0').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Unsaved draft')
  await showRibbonItem(page, 'format.shrink-to-fit')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('Unsaved draft')
  await expect(button(page, 'Shrink to fit')).toBeDisabled()
  await editor.press('Escape')
  await expect(cell(page, '0:0')).toHaveText('Inventory AVAV 2026-0000000123456789')
  await expectShrinkFits(cell(page, '0:0'))
  await expect(button(page, 'Undo')).toBeDisabled()
})
