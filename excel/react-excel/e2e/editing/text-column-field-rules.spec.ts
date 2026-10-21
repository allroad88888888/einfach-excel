import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390]) for (const action of ['Skip field', 'Field number', 'Reset rules'])
  test(`${action} keeps source field numbering and one native split at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'E95', '94:4')
    await button('Text to columns').click()
    const dialog = page.getByRole('dialog', { name: 'Text to columns', exact: true })
    await dialog.getByRole('textbox', { name: 'Destination cell', exact: true }).fill('A95')
    const number = dialog.getByRole('spinbutton', { name: 'Source field number', exact: true })
    const kind = dialog.getByRole('combobox', { name: 'Field type', exact: true })
    await number.fill('1')
    await kind.selectOption('general')
    if (action === 'Field number') {
      for (const invalid of ['0', '-1', '1.5', '16385']) {
        await number.fill(invalid)
        await expect(kind).toBeDisabled()
        await expect(button('Undo')).toBeDisabled()
      }
    }
    await number.fill('3')
    await expect(kind).toBeEnabled()
    await kind.selectOption('skip')
    await number.fill('1')
    await expect(kind).toHaveValue('general')
    await number.fill('3')
    await expect(kind).toHaveValue('skip')
    const reset = action === 'Reset rules'
    if (reset) {
      const mode = dialog.getByRole('combobox', { name: 'Split mode', exact: true })
      await mode.selectOption('fixedWidth')
      await mode.selectOption('delimited')
      await expect(kind).toHaveValue('preserve')
      await expect(dialog.getByRole('list', { name: 'Configured field types' })).toHaveCount(0)
    }
    await button('Update preview').click()
    const preview = dialog.getByRole('table', { name: 'Split preview' })
    await expect(preview.getByRole('columnheader')).toHaveText(
      reset ? ['Row', 'A95', 'B95', 'C95', 'D95'] : ['Row', 'A95', 'B95', 'C95'],
    )
    await button('Apply split').click()
    await expect(dialog).toHaveCount(0)
    await expect(await select(page, 'A95', '94:0')).toHaveText(reset ? '001' : '1')
    await expect(cell('94:1')).toHaveText('29/02/2024')
    await expect(await select(page, 'C95', '94:2')).toHaveText(reset ? 'ignore' : '=1+2')
    await expect(await select(page, 'D95', '94:3')).toHaveText(reset ? '=1+2' : '')
    await expect(await select(page, 'E95', '94:4')).toHaveText('001,29/02/2024,ignore,=1+2')
    await button('Undo').click()
    await expect(await select(page, 'A95', '94:0')).toHaveText('')
    await expect(cell('94:1')).toHaveText('')
    await expect(button('Undo')).toBeDisabled()
    await button('Redo').click()
    await expect(cell('94:0')).toHaveText(reset ? '001' : '1')
  })
