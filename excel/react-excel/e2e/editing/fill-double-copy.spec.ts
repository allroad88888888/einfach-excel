import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 两个数值样本让复制与序列的结果不同，避免公式平移掩盖 modifier 失效。
for (const width of [1280, 390]) for (const modifier of ['Control', 'Meta'] as const)
  test(`${modifier} double-click obeys platform copy semantics in one native fill at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const formula = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    for (const [address, coord, value] of [['B71', '70:1', '2'], ['B72', '71:1', '3']]) {
      await select(page, address!, coord!)
      await formula.fill(value!)
      await formula.press('Enter')
      await expect(cell(coord!)).toHaveText(value!)
    }
    await select(page, 'B71:B72', '71:1')
    const macControl = modifier === 'Control' && await page.evaluate(() => /Mac/.test(navigator.platform))
    if (macControl) await page.evaluate(() => {
      Reflect.set(window, 'fillContextMenus', 0)
      document.querySelector('.fill-handle')!.addEventListener('contextmenu', event => {
        if (event.isTrusted) Reflect.set(window, 'fillContextMenus', Reflect.get(window, 'fillContextMenus') + 1)
      })
    })
    await button('Drag to fill').dblclick({ modifiers: [modifier] })
    if (macControl) {
      // macOS 的 Ctrl+点击是原生右键，不注入假的 dblclick 冒充已验证复制。
      expect(await page.evaluate(() => Reflect.get(window, 'fillContextMenus'))).toBe(2)
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B71:B72')
      await expect(cell('72:1')).toHaveText('')
      await page.keyboard.press('Escape')
      await button('Drag to fill').dblclick({ modifiers: ['Meta'] })
    }
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B71:B73')
    await expect(page.getByLabel('Fill status')).toHaveText('Filled down.')
    await expect(cell('72:1')).toHaveText('2')
    await expect(cell('72:1')).toHaveCSS('font-weight', '700')
    await expect(cell('70:1')).toHaveText('2')
    await expect(cell('71:1')).toHaveText('3')
    await expect(cell('72:0')).toHaveText('4')
    await select(page, 'B73', '72:1')
    await expect(formula).toHaveValue('2')
    await button('Undo').click()
    await expect(cell('72:1')).toHaveText('')
    await expect(cell('70:1')).toHaveText('2')
    await expect(cell('71:1')).toHaveText('3')
    await button('Undo').click()
    await expect(cell('71:1')).toHaveText('')
    await button('Undo').click()
    await expect(cell('70:1')).toHaveText('4')
    await expect(button('Undo')).toBeDisabled()
    for (let index = 0; index < 3; index++) await button('Redo').click()
    await expect(cell('70:1')).toHaveText('2')
    await expect(cell('71:1')).toHaveText('3')
    await expect(cell('72:1')).toHaveText('2')
    await expect(button('Redo')).toBeDisabled()
  })
