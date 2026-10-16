import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 借鉴 Univer 的“拒绝后下一次合法写入仍成功”，补上真实视图的取消、定位与历史交叉。
for (const width of [1280, 390]) for (const source of ['cell', 'formula'] as const) {
  test(`${source} rejected draft can cancel, navigate and edit again at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await page.getByRole('tab', { name: 'Data', exact: true }).click()
    const target = await select(page, 'H45', '44:7')
    const bar = page.getByRole('textbox', { name: 'Active cell value' })
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await bar.fill('8')
    await bar.press('Enter')
    await expect(target).toHaveText('8')
    await undo.click()
    await expect(target).toHaveText('5')
    await select(page, 'H45', '44:7')
    if (source === 'cell') await target.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
    })
    await input.fill('5.5')
    await input.press('Enter')
    await expect(page.getByRole('alert')).toContainText('data validation rule')
    await expect(input).toHaveValue('5.5')
    await input.press('Escape')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(await select(page, 'H45', '44:7')).toHaveText('5')
    await expect(redo).toBeEnabled()
    // 失败及取消不能吃掉原来的 redo，也不能把下一格写回被拒绝的地址。
    await redo.click()
    await expect(target).toHaveText('8')
    await undo.click()
    const next = await select(page, 'H46', '45:7')
    if (source === 'cell') await next.dblclick()
    await input.fill('0.75')
    await input.press('Enter')
    await expect(next).toHaveText('0.75')
    await expect(redo).toBeDisabled()
    await undo.click()
    await expect(next).toHaveText('0.5')
    await expect(undo).toBeDisabled()
    await expect(await select(page, 'H45', '44:7')).toHaveText('5')
  })
}
