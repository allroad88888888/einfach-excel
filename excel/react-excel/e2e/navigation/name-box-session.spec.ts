import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

const actions = ['Blur address', 'Escape', 'Blur name', 'Focus replace', 'Blank blur', 'Invalid correction']
for (const width of [1280, 390]) for (const action of actions)
  test(`${action} name box preserves native values and its exact history boundary at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    const name = page.getByRole('textbox', { name: 'Name box', exact: true })
    const tab = (label: string) => page.getByRole('tab', { name: label, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('2')
    await bar.press('Enter')
    await expect(cell('1:6')).toHaveText('158')
    await button('Undo').click()
    await select(page, 'B300', '299:1')
    const destination = await cell('299:1').innerText()
    await select(page, 'G2', '1:6')
    const scroll = page.getByTestId('sheet-scroll')
    const before = await scroll.evaluate(node => [node.scrollLeft, node.scrollTop])
    if (action === 'Focus replace') {
      await name.click()
      expect(await name.evaluate(node => {
        const input = node as HTMLInputElement
        return [input.selectionStart, input.selectionEnd]
      })).toEqual([0, 2])
      await page.keyboard.type('B300')
      await expect(name).toHaveValue('B300')
      await page.keyboard.press('Enter')
      await expect(name).toHaveValue('B300')
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
      await expect(cell('299:1')).toHaveText(destination)
    } else if (action === 'Invalid correction') {
      await name.fill('P1002')
      await page.keyboard.press('Enter')
      await expect(name).toHaveAttribute('aria-invalid', 'true')
      await expect(name).toHaveValue('P1002')
      await expect(name).toBeFocused()
      await expect(page.locator('.name-box-feedback')).toContainText('outside the current worksheet canvas')
      await expect(cell('1:6')).toHaveAttribute('data-selected', 'true')
      expect(await scroll.evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual(before)
      await expect(button('Undo')).toBeDisabled()
      await expect(button('Redo')).toBeEnabled()
      await name.fill('B300')
      await page.keyboard.press('Enter')
      await expect(name).toHaveValue('B300')
      await expect(page.locator('.name-box-feedback')).toHaveCount(0)
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
      await expect(cell('299:1')).toHaveText(destination)
    } else if (action === 'Escape') {
      await name.fill('B300')
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
      await expect(name).toHaveValue('G2')
      expect(await scroll.evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual(before)
      await expect(bar).toHaveValue('=E2*F2')
    } else {
      await name.fill(action === 'Blur name' ? 'BlurRevenue' : action === 'Blank blur' ? '' : 'B300')
      // 点击非编辑控件触发真实 blur；异步名称回包也不能抢回这个焦点。
      await tab('View').click()
      await expect(name).toHaveValue(action === 'Blur name' ? 'BlurRevenue'
        : action === 'Blank blur' ? 'G2' : 'B300')
      await expect(tab('View')).toBeFocused()
      if (action === 'Blur address') {
        await expect(cell('299:1')).toHaveText(destination)
        await expect(bar).toHaveValue(destination)
      } else if (action === 'Blank blur') {
        expect(await scroll.evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual(before)
        await expect(bar).toHaveValue('=E2*F2')
      }
      await tab('Start').click()
    }
    if (action === 'Blur name') {
      await expect(button('Redo')).toBeDisabled()
      await button('Name manager').click()
      await button('Edit BlurRevenue').click()
      await expect(page.getByRole('textbox', { name: 'Refers to', exact: true })).toHaveValue('G2')
      await button('Cancel').click()
      await button('Undo').click()
      await expect(button('Undo')).toBeDisabled()
      await button('Name manager').click()
      await expect(button('Edit BlurRevenue')).toHaveCount(0)
      await expect(button('Edit SampleAmounts')).toBeVisible()
      await button('Cancel').click()
      await button('Redo').click()
      await button('Name manager').click()
      await expect(button('Edit BlurRevenue')).toBeVisible()
      await button('Cancel').click()
    } else {
      await expect(button('Undo')).toBeDisabled()
      await expect(button('Redo')).toBeEnabled()
      await button('Redo').click()
    }
    await select(page, 'G2', '1:6')
    await expect(cell('1:6')).toHaveText(action === 'Blur name' ? '79' : '158')
    await expect(bar).toHaveValue('=E2*F2')
    await expect(cell('1:6')).toHaveCSS('font-family', 'Georgia')
    await expect(cell('1:5')).toHaveText('79')
  })
