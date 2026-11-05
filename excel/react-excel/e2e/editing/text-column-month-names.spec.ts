import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

const sources = [['dateDmy', '15 Mar 2024'], ['dateMdy', 'March 15 2024'], ['dateYmd', '2024/3月/15']]

test('date fields accept month names in their selected order', async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await expect(cell('1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  for (const [index, [kind, source]] of sources.entries()) {
    const row = 92 + index
    await select(page, `E${row}`, `${row - 1}:4`)
    await bar.fill(`${source},keep`)
    await bar.press('Enter')
    await select(page, `E${row}`, `${row - 1}:4`)
    await button('Text to columns').click()
    const dialog = page.getByRole('dialog', { name: 'Text to columns', exact: true })
    await dialog.getByRole('textbox', { name: 'Destination cell', exact: true }).fill(`A${row}`)
    await dialog.getByRole('spinbutton', { name: 'Source field number', exact: true }).fill('1')
    await dialog.getByRole('combobox', { name: 'Field type', exact: true }).selectOption(kind!)
    await button('Update preview').click()
    await expect(dialog.getByRole('table', { name: 'Split preview' })).toContainText('2024-03-15')
    // 后两行的目标格在演示表里已有内容，需要明确确认覆盖。
    const overwrite = dialog.getByRole('checkbox', { name: /^Overwrite/ })
    if (await overwrite.count()) await overwrite.check()
    await button('Apply split').click()
    await expect(dialog).toHaveCount(0)
    await expect(await select(page, `A${row}`, `${row - 1}:0`)).toHaveText('2024-03-15')
    await expect(bar).toHaveValue('45366')
  }
})
