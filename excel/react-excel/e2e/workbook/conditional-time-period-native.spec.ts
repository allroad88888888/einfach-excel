import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { addDateRule, dateButton as button, dateCell as cell,
  openDateRules, openDateFile, downloadDateFile } from '../support/conditional-dates'

test('date conditional rules survive native reopen with editable periods and stop options', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A13:F13', '12:0')
  await addDateRule(page, 'A13:C13, E13:F13', 'last7Days')
  await openDateRules(page)
  await button(page, 'Edit rule 1').click()
  await page.getByLabel('Stop if true').check()
  await button(page, 'Save rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const bytes = await downloadDateFile(page)
  const saved = JSON.parse(bytes.toString())
  const rules = saved.workbook.conditionalFormats.find((entry: { sheet: number }) => entry.sheet === 1).rules
  expect(rules.some((entry: { rule: { kind: string; period: string; stopIfTrue: boolean } }) =>
    entry.rule.kind === 'time-period' && entry.rule.period === 'last7Days' && entry.rule.stopIfTrue)).toBe(true)
  await openDateFile(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A13:F13', '12:0')
  for (const col of [0, 1, 2]) await expect(cell(page, `12:${col}`)).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  for (const col of [3, 4, 5]) await expect(cell(page, `12:${col}`)).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await openDateRules(page)
  await button(page, 'Edit rule 1').click()
  await expect(page.getByLabel('Rule type')).toHaveValue('time-period')
  await expect(page.getByLabel('Date period')).toHaveValue('last7Days')
  await expect(page.getByLabel('Stop if true')).toBeChecked()
  await expect(page.getByLabel('Applies to')).toHaveValue('A13:C13, E13:F13')
  await button(page, 'Disable rule 1').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '12:0')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await button(page, 'Undo').click()
  await expect(cell(page, '12:0')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await select(page, 'C13', '12:2')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=TODAY()+0.75')
})

test('date highlights paint native conditional colors on Canvas and undo removes them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toBeVisible()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('B13:C13')
  await name.press('Enter')
  await addDateRule(page, 'B13:C13', 'today', '#13abcd')
  await name.fill('A13')
  await name.press('Enter')
  const pixels = () => canvas.evaluate((node) => {
    const target = node as HTMLCanvasElement
    const rgba = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data
    let matched = 0
    for (let i = 0; i < rgba.length; i += 4)
      if (rgba[i] === 19 && rgba[i + 1] === 171 && rgba[i + 2] === 205 && rgba[i + 3] === 255) matched++
    return matched
  })
  await expect.poll(pixels).toBeGreaterThan(50)
  await button(page, 'Undo').click()
  await expect.poll(pixels).toBe(0)
  await button(page, 'Redo').click()
  await expect.poll(pixels).toBeGreaterThan(50)
  await page.screenshot({ path: test.info().outputPath('date-canvas.png') })
})
