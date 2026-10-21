import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

const cases = [
  { action: 'Other delimiter', source: 'North、001', values: ['North', '001'] },
  { action: 'Single quote', source: "'North, America',001", values: ['North, America', '001'] },
  { action: 'No qualifier', source: '"North, America",001', values: ['"North', ' America"', '001'] },
]
for (const width of [1280, 390]) for (const { action, source, values } of cases)
  test(`${action} split rule controls literal boundaries without writing outside the output at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'E92', '91:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    // 前导标记只用于输入原文，内层单引号必须留给 Rust 分列。
    await bar.fill(`'${source}`)
    await bar.press('Enter')
    await expect(cell('91:4')).toHaveText(source)
    await select(page, 'E92', '91:4')
    await button('Text to columns').click()
    const dialog = page.getByRole('dialog', { name: 'Text to columns', exact: true })
    await dialog.getByRole('textbox', { name: 'Destination cell', exact: true }).fill('A92')
    if (action === 'Other delimiter') {
      await dialog.getByRole('checkbox', { name: 'Comma', exact: true }).uncheck()
      await dialog.getByRole('textbox', { name: 'Other delimiter characters', exact: true }).fill('、')
    } else {
      await dialog.getByRole('combobox', { name: 'Text qualifier', exact: true })
        .selectOption(action === 'Single quote' ? "'" : '')
    }
    await button('Update preview').click()
    await expect(dialog.getByRole('status')).toHaveText(`Output: A92:${values.length === 2 ? 'B' : 'C'}92`)
    await button('Apply split').click()
    await expect(dialog).toHaveCount(0)
    for (const [index, value] of values.entries()) {
      const result = await select(page, `${String.fromCharCode(65 + index)}92`, `91:${index}`)
      await expect(result).toHaveText(value)
      expect(await result.textContent()).toBe(value)
    }
    await expect(await select(page, 'D92', '91:3')).toHaveText('')
    await expect(await select(page, 'E92', '91:4')).toHaveText(source)
    await button('Undo').click()
    await expect(await select(page, 'A92', '91:0')).toHaveText('')
    await expect(cell('91:1')).toHaveText('')
    await button('Undo').click()
    await expect(await select(page, 'E92', '91:4')).toHaveText('')
    await expect(button('Undo')).toBeDisabled()
    await button('Redo').click()
    await button('Redo').click()
    await expect(await select(page, 'A92', '91:0')).toHaveText(values[0]!)
  })
