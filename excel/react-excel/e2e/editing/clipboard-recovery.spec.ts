import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** 只让浏览器权限边界失败一次；读写数据仍走真实浏览器及 Rust Worker。 */
async function denyOnce(page: Page, method: 'read' | 'write') {
  await page.evaluate((method) => {
    const original = navigator.clipboard[method].bind(navigator.clipboard)
    Object.defineProperty(navigator.clipboard, method, {
      configurable: true,
      value: () => {
        Object.defineProperty(navigator.clipboard, method, { configurable: true, value: original })
        return Promise.reject(new DOMException('Test permission denied', 'NotAllowedError'))
      },
    })
  }, method)
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const width of [1280, 390]) {
  test(`failed cut preserves previous clipboard and can retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await select(page, 'A2', '1:0')
    await copy(page)
    const sourceValue = await (await select(page, 'B2', '1:1')).innerText()
    await denyOnce(page, 'write')
    await button(page, 'Cut').click()
    await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText('permission')
    await expect(button(page, 'Undo')).toBeDisabled()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SO-10001')
    const target = await select(page, 'A4', '3:0')
    await paste(page)
    await expect(target).toHaveText('SO-10001')
    await expect(target).toHaveCSS('font-weight', '700')
    await expect(await select(page, 'B2', '1:1')).toHaveText(sourceValue)
    await copy(page, 'Cut')
    const next = await select(page, 'B4', '3:1')
    const targetValue = await next.innerText()
    await paste(page)
    await expect(next).toHaveText(sourceValue)
    await expect(await select(page, 'B2', '1:1')).toHaveText('')
    await button(page, 'Undo').click()
    await expect(page.locator('td[data-cell="1:1"]')).toHaveText(sourceValue)
    await expect(await select(page, 'B4', '3:1')).toHaveText(targetValue)
    expect(errors).toEqual([])
  })

  test(`failed paste preserves redo and keyboard retry works from another ribbon tab at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const target = await select(page, 'A4', '3:0')
    const original = await target.innerText()
    const bar = page.getByRole('textbox', { name: 'Active cell value' })
    await bar.fill('temporary')
    await bar.press('Enter')
    await expect(target).toHaveText('temporary')
    await button(page, 'Undo').click()
    await expect(target).toHaveText(original)
    await select(page, 'A4', '3:0')
    await page.evaluate(() => navigator.clipboard.writeText('recovered'))
    await denyOnce(page, 'read')
    await button(page, 'Paste').click()
    await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText('permission')
    await expect(target).toHaveText(original)
    await expect(button(page, 'Redo')).toBeEnabled()
    await page.getByRole('tab', { name: 'Formulas', exact: true }).click()
    await page.locator('[data-workbook-grid]').press('ControlOrMeta+v')
    await expect(page.getByLabel('Clipboard status')).toHaveText('Pasted cells.')
    await expect(target).toHaveText('recovered')
    await expect(button(page, 'Redo')).toBeDisabled()
    await button(page, 'Undo').click()
    await expect(target).toHaveText(original)
    await button(page, 'Redo').click()
    await expect(target).toHaveText('recovered')
  })
}
