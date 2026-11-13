import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { dateButton as button, dateCell as cell, openDateRules as openRules,
  openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { addStateRule } from '../support/conditional-cell-state'

test('cell state types preserve empty formulas whitespace and editable options on native reopen', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A35:C38', '34:0')
  await addStateRule(page, 'A35:C36, A38:C38', 'not-blank')
  await openRules(page)
  await button(page, 'Edit rule 1').click()
  await page.getByLabel('Stop if true').check()
  await button(page, 'Save rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const bytes = await downloadFile(page)
  const native = JSON.parse(bytes.toString())
  const saved = native.workbook.cells.filter((entry: { sheet: number; row: number; col: number }) =>
    entry.sheet === 1 && entry.row >= 34 && entry.row <= 37 && entry.col <= 2)
  expect(saved.some((entry: { addr: string }) => entry.addr === 'A35')).toBe(false)
  expect(saved.find((entry: { addr: string }) => entry.addr === 'C35'))
    .toMatchObject({ kind: 'formula', value: '=""' })
  expect(saved.find((entry: { addr: string }) => entry.addr === 'C37')).toMatchObject({ value: '\t' })
  expect(saved.find((entry: { addr: string }) => entry.addr === 'A38')).toMatchObject({ value: '\u00a0' })
  await openFile(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A35:C38', '34:0')
  for (const coord of ['35:2', '37:0', '37:2'])
    await expect(cell(page, coord)).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  for (const coord of ['34:0', '35:1', '36:0', '37:1'])
    await expect(cell(page, coord)).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await openRules(page)
  await button(page, 'Edit rule 1').click()
  await expect(page.getByLabel('Rule type')).toHaveValue('cell-state')
  await expect(page.getByLabel('Cell condition')).toHaveValue('not-blank')
  await expect(page.getByLabel('Stop if true')).toBeChecked()
  await expect(page.getByLabel('Applies to')).toHaveValue('A35:C36, A38:C38')
  await button(page, 'Disable rule 1').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '35:2')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await button(page, 'Undo').click()
  await expect(cell(page, '35:2')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
})

test('blank conditional colors paint truly absent Canvas cells without persisting values', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toBeVisible()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A35:C35')
  await name.press('Enter')
  await addStateRule(page, 'A35:C35', 'blank', '#13abcd')
  await name.fill('A34')
  await name.press('Enter')
  const pixels = () => canvas.evaluate(node => {
    const target = node as HTMLCanvasElement
    const rgba = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data
    let count = 0
    for (let i = 0; i < rgba.length; i += 4)
      if (rgba[i] === 19 && rgba[i + 1] === 171 && rgba[i + 2] === 205) count++
    return count
  })
  await expect.poll(pixels).toBeGreaterThan(50)
  await button(page, 'Undo').click()
  await expect.poll(pixels).toBe(0)
  await button(page, 'Redo').click()
  await expect.poll(pixels).toBeGreaterThan(50)
  await page.screenshot({ path: test.info().outputPath('state-canvas.png') })
})
