import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function border(page: Page, address: string, coord: string, color: string, style: string) {
  await select(page, address, coord)
  await page.getByRole('button', { name: 'Border settings', exact: true }).click()
  await page.getByLabel('Position', { exact: true }).selectOption('right')
  await page.getByLabel('Line style', { exact: true }).selectOption(style)
  await page.getByLabel('Hex color', { exact: true }).fill(color)
  await page.getByRole('button', { name: 'Apply borders', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
}

for (const mode of ['down', 'drag-copy', 'series', 'drag-series']) {
  test(`${mode} replaces a neighbouring thick border and undoes in the same step`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await border(page, 'A40:A41', '39:0', '#123abc', 'thin')
    await border(page, 'A42:A43', '41:0', '#c00000', 'thick')
    const peerValue = await cell(page, '41:1').textContent()
    if (mode.startsWith('drag')) {
      await select(page, 'A40:A41', '39:0')
      if (mode === 'drag-copy') await page.keyboard.down('Control')
      await page.getByRole('button', { name: 'Drag to fill', exact: true }).hover()
      await page.mouse.down()
      const target = (await cell(page, '42:0').boundingBox())!
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 5 })
      await expect(page.getByTestId('fill-preview')).toBeVisible()
      await page.mouse.up()
      if (mode === 'drag-copy') await page.keyboard.up('Control')
    } else {
      await select(page, 'A40:A43', '39:0')
      if (mode === 'down') {
        await page.getByRole('combobox', { name: 'Fill selected range' }).selectOption('down')
      } else {
        await page.getByRole('button', { name: 'Fill series', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Fill series', exact: true })
        await dialog.getByLabel('Sequence type').selectOption('number')
        await dialog.getByLabel('Source sample count').fill('2')
        await dialog.getByRole('button', { name: 'Apply series', exact: true }).click()
        await expect(dialog).toHaveCount(0)
      }
    }
    await expect(page.getByLabel('Fill status')).toContainText('Filled')
    await select(page, 'B40', '39:1')
    const expected = mode === 'down' ? '1' : mode === 'drag-copy' ? '3' : '7'
    await expect(cell(page, '42:0')).toHaveText(expected)
    await expect(cell(page, '41:0')).toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
    await expect(cell(page, '41:0')).toHaveCSS('border-right-width', '1px')
    await expect(cell(page, '41:1')).toHaveText(peerValue!)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '42:0')).toHaveText('')
    await expect(cell(page, '40:0')).toHaveText('3')
    await expect(cell(page, '41:0')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
    await expect(cell(page, '41:0')).toHaveCSS('border-right-width', '3px')
    await expect(cell(page, '41:1')).toHaveText(peerValue!)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '42:0')).toHaveText(expected)
    await expect(cell(page, '41:0')).toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
  })
}
