import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const width of [1280, 390]) {
  test(`formula-bar Enter and Escape return to keyboard navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const target = await select(page, 'B3', '2:1')
    const bar = page.getByRole('textbox', { name: 'Active cell value' })
    const name = page.getByRole('textbox', { name: 'Name box' })
    const grid = page.locator('[data-workbook-grid]')
    await bar.fill('Saved from formula bar')
    await bar.press('Enter')
    await expect(target).toHaveText('Saved from formula bar')
    await expect(grid).toBeFocused()
    // 使用当前真实焦点，不用 grid.press() 掩盖保存后丢失焦点。
    await page.keyboard.press('ArrowDown')
    await expect(name).toHaveValue('B4')
    await bar.fill('Discard this draft')
    await bar.press('Escape')
    await expect(grid).toBeFocused()
    await expect(page.locator('td[data-cell="3:1"]')).toHaveText('Contoso')
    await page.keyboard.press('ArrowRight')
    await expect(name).toHaveValue('C4')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(target).toHaveText('Northwind')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(target).toHaveText('Saved from formula bar')
  })

  test(`rejected formula-bar input keeps keyboard correction usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const target = await select(page, 'H45', '44:7')
    const bar = page.getByRole('textbox', { name: 'Active cell value' })
    await bar.fill('5.5')
    await bar.press('Enter')
    await expect(page.getByRole('alert')).toContainText('data validation rule')
    await expect(bar).toHaveValue('5.5')
    await expect(bar).toBeFocused()
    await expect(target).toHaveText('5')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('8')
    await page.keyboard.press('Enter')
    await expect(target).toHaveText('8')
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('H46')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(target).toHaveText('5')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}

test('a delayed formula-bar commit preserves a newly focused name-box draft', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Object.defineProperty(window, 'releaseFormulaEdit', { value: () => release() })
    Worker.prototype.postMessage = function (
      message: { command?: string },
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () =>
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'cell.setInput') release = send
      else send()
    }
  })
  await page.reload()
  const target = await select(page, 'B3', '2:1')
  const bar = page.getByRole('textbox', { name: 'Active cell value' })
  await bar.fill('Delayed value')
  await bar.press('Enter')
  await expect(bar).toBeDisabled()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('B100')
  await page.evaluate(() => Reflect.get(window, 'releaseFormulaEdit')())
  await expect(target).toHaveText('Delayed value')
  await expect(name).toBeFocused()
  await expect(name).toHaveValue('B100')
  await name.press('Enter')
  await expect(page.locator('td[data-cell="99:1"]')).toBeVisible()
  await expect(name).toHaveValue('B100')
})
