import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390]) for (const source of ['cell', 'formula'] as const) {
  test(`${source} rejected blur cannot be replaced by another cell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const target = await select(page, 'H45', '44:7')
    const other = page.locator('td[data-cell="43:7"]')
    const otherValue = await other.innerText()
    if (source === 'cell') await target.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
    })
    await input.fill('5.5')
    // 点击其它格触发真实 blur 写入失败，再尝试开始另一格编辑。
    await other.click()
    const error = page.getByRole('alert')
    await expect(error).toContainText('data validation rule')
    await expect(input).toHaveValue('5.5')
    await other.dblclick()
    await expect(input).toHaveValue('5.5')
    await expect(input).toBeFocused()
    await expect(error).toContainText('data validation rule')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('H45')
    if (source === 'formula')
      await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
    await expect(target).toHaveText('5')
    await expect(other).toHaveText(otherValue)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    // 直接使用恢复后的真实焦点，修正必须仍写到 H45 而不是 H44。
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('8')
    await page.keyboard.press('Enter')
    await expect(target).toHaveText('8')
    await expect(other).toHaveText(otherValue)
    await expect(error).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(target).toHaveText('5')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(target).toHaveText('8')
  })
}

for (const source of ['cell', 'formula'] as const) {
  test(`${source} rejected draft can explicitly cancel before editing the next cell`, async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const target = await select(page, 'H45', '44:7')
    if (source === 'cell') await target.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
    })
    await input.fill('5.5')
    const next = page.locator('td[data-cell="43:7"]')
    const before = await next.innerText()
    await next.click()
    await expect(page.getByRole('alert')).toContainText('data validation rule')
    await next.dblclick()
    await expect(input).toHaveValue('5.5')
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await next.dblclick()
    const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
    await editor.fill('Next cell edit')
    await editor.press('Enter')
    await expect(next).toHaveText('Next cell edit')
    await expect(target).toHaveText('5')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(next).toHaveText(before)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
