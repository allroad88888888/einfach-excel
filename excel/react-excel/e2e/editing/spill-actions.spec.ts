import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Spill details' })
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'H94', '93:7')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Keep spill redo'); await input.press('Enter')
  await expect(cell(page, '93:7')).toHaveText('Keep spill redo')
  await button(page, 'Undo').click()
  await expect(cell(page, '93:7')).toHaveText('')
  await select(page, 'F58', '57:5')
})

for (const action of ['Open', 'Refresh', 'Select spill range', 'Go to formula cell',
  'Select blocking cell', 'Close', 'Escape', 'Tab', 'Shift+Tab'])
  for (const width of [1280, 390])
  test(`${action} spill details preserves native values and redo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const blocked = action === 'Select blocking cell'
    if (blocked) await select(page, 'F62', '61:5')
    if (action === 'Refresh') {
      // 一次真实传输失败；重试仍由原 Worker 查询 Rust，不伪造检查结果。
      await page.evaluate(() => {
        const post = Worker.prototype.postMessage
        let fail = true
        Worker.prototype.postMessage = function (
          message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
        ) {
          if (fail && message.command === 'formula.inspectSpill') {
            fail = false
            throw new Error('Spill inspection unavailable')
          }
          post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
        }
      })
    }
    await button(page, 'Spill details').click()
    if (action === 'Refresh') {
      await expect(dialog(page).getByRole('alert')).toHaveText('Spill inspection unavailable')
      await expect(button(page, 'Select spill range')).toHaveCount(0)
      await button(page, 'Refresh').click()
      await expect(dialog(page).getByRole('alert')).toHaveCount(0)
    }
    if (blocked) {
      await expect(dialog(page)).toContainText('Formula cell: F62')
      await expect(dialog(page)).toContainText('Blocked by F63.')
      await expect(button(page, 'Select spill range')).toHaveCount(0)
    } else {
      await expect(dialog(page)).toContainText('Formula cell: F57')
      await expect(dialog(page)).toContainText('Spill range: F57:F59')
      await expect(dialog(page)).toContainText('Size: 3 × 1 (rows × columns)')
    }
    if (action === 'Tab' || action === 'Shift+Tab') {
      await button(page, action === 'Tab' ? 'Close' : 'Select spill range').focus()
      await page.keyboard.press(action)
      await expect(button(page, action === 'Tab' ? 'Select spill range' : 'Close')).toBeFocused()
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('F58')
    }
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await button(page, ['Open', 'Refresh', 'Tab', 'Shift+Tab'].includes(action) ? 'Close' : action).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Name box' }))
      .toHaveValue(blocked ? 'F63' : action === 'Select spill range' ? 'F57:F59'
        : action === 'Go to formula cell' ? 'F57' : 'F58')
    if (blocked) {
      await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('Clear to unblock')
      await expect(cell(page, '61:5')).toHaveText('#SPILL!')
      await expect(cell(page, '62:5')).toHaveText('Clear to unblock')
    }
    if (action === 'Go to formula cell')
      await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=H57#*10')
    await expect(cell(page, '56:5')).toHaveText('10')
    await expect(cell(page, '57:5')).toHaveText('20')
    await expect(cell(page, '58:5')).toHaveText('30')
    await expect(cell(page, '57:6')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await select(page, 'H94', '93:7')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('Keep spill redo')
    await button(page, 'Undo').click()
    await expect(cell(page, '93:7')).toHaveText('')
  })
