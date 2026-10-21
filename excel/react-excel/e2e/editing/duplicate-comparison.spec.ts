import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

const policies = [
  { comparison: 'exact', removed: 1, ids: ['M1', 'M3', 'M4', 'P1', ''] },
  { comparison: 'ignoreCase', removed: 2, ids: ['M1', 'M4', 'P1', '', ''] },
  { comparison: 'trim', removed: 2, ids: ['M1', 'M3', 'P1', '', ''] },
  { comparison: 'trimIgnoreCase', removed: 3, ids: ['M1', 'P1', '', '', ''] },
]
for (const width of [1280, 390]) for (const { comparison, removed, ids } of policies)
  test(`${comparison} duplicates preserves native record order in one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'D32:F37', '31:3')
    await button('Remove duplicates').click()
    const dialog = page.getByRole('dialog', { name: 'Remove duplicates', exact: true })
    await expect(dialog.getByRole('status')).toContainText('0 duplicate records;')
    await dialog.getByRole('checkbox', { name: 'Compare column F', exact: true }).uncheck()
    const policy = dialog.getByRole('combobox', { name: 'Text comparison', exact: true })
    await policy.selectOption(comparison === 'exact' ? 'trimIgnoreCase' : 'exact')
    await policy.selectOption(comparison)
    await expect(button('Remove records')).toBeDisabled()
    await button('Update preview').click()
    await expect(dialog.getByRole('status')).toHaveText(
      `${removed} duplicate records; ${5 - removed} unique records remain.`,
    )
    await dialog.getByRole('checkbox', { name: `Remove ${removed} duplicate records (one undo restores them)`,
      exact: true }).check()
    await button('Remove records').click()
    await expect(dialog).toHaveCount(0)
    // 每个目标实际定位，窄屏不依赖离屏单元格仍挂载。
    for (let index = 0; index < ids.length; index++)
      await expect(await select(page, `F${index + 33}`, `${index + 32}:5`)).toHaveText(ids[index]!)
    await expect(await select(page, 'F33', '32:5')).toHaveCSS('font-style', 'italic')
    const pineRow = 33 + ids.indexOf('P1')
    await expect(await select(page, `F${pineRow}`, `${pineRow - 1}:5`))
      .toHaveCSS('text-decoration-line', 'underline')
    await expect(await select(page, 'D32', '31:3')).toHaveText('Key')
    await expect(cell('31:3')).toHaveCSS('font-weight', '700')
    await expect(await select(page, 'A32', '31:0')).toHaveText('')
    await button('Undo').click()
    for (const [index, value] of ['M1', 'M2', 'M3', 'M4', 'P1'].entries())
      await expect(await select(page, `F${index + 33}`, `${index + 32}:5`)).toHaveText(value)
    await expect(button('Undo')).toBeDisabled()
    await button('Redo').click()
    await expect(await select(page, 'F34', '33:5')).toHaveText(ids[1]!)
    await expect(await select(page, 'F37', '36:5')).toHaveText('')
    await expect(button('Redo')).toBeDisabled()
  })
