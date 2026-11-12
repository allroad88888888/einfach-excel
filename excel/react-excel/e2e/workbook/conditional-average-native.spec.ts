import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { dateButton as button, dateCell as cell, openDateRules as openRules,
  openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { addAverageRule } from '../support/conditional-average'

test('average rules retain direction equality scope and management after native reopen', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A14:C14', '13:0')
  await addAverageRule(page, 'A14:C14, E14:F14', 'below', true)
  await openRules(page)
  await button(page, 'Edit rule 1').click()
  await page.getByLabel('Stop if true').check()
  await button(page, 'Save rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const bytes = await downloadFile(page)
  const native = JSON.parse(bytes.toString())
  const rules = native.workbook.conditionalFormats
    .find((entry: { sheet: number }) => entry.sheet === 1).rules
  expect(rules).toEqual(expect.arrayContaining([expect.objectContaining({
    rule: expect.objectContaining({ kind: 'above-average', direction: 'below',
      equalAverage: true, stopIfTrue: true }),
  })]))
  await openFile(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A14:F14', '13:0')
  for (let col = 0; col < 6; col++) {
    if (col < 2) await expect(cell(page, `13:${col}`)).toHaveCSS('background-color', 'rgb(0, 255, 0)')
    else await expect(cell(page, `13:${col}`)).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  }
  await openRules(page)
  await button(page, 'Edit rule 1').click()
  await expect(page.getByLabel('Rule type')).toHaveValue('above-average')
  await expect(page.getByLabel('Average comparison')).toHaveValue('below')
  await expect(page.getByLabel('Include equal average')).toBeChecked()
  await expect(page.getByLabel('Stop if true')).toBeChecked()
  await expect(page.getByLabel('Applies to')).toHaveValue('A14:C14, E14:F14')
  await button(page, 'Copy rule 1').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await button(page, 'Undo').click()
  await openRules(page)
  await button(page, 'Disable rule 1').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '13:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await button(page, 'Undo').click()
  await expect(cell(page, '13:1')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
})

test('average highlights paint native conditional colors on Canvas and undo removes them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toBeVisible()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A14:C14')
  await name.press('Enter')
  await addAverageRule(page, 'A14:C14', 'above', true, '#13abcd')
  await name.fill('A13')
  await name.press('Enter')
  const pixels = () => canvas.evaluate((node) => {
    const target = node as HTMLCanvasElement
    const rgba = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data
    let matched = 0
    for (let i = 0; i < rgba.length; i += 4)
      if (rgba[i] === 19 && rgba[i + 1] === 171 &&
        rgba[i + 2] === 205 && rgba[i + 3] === 255) matched++
    return matched
  })
  await expect.poll(pixels).toBeGreaterThan(50)
  await button(page, 'Undo').click()
  await expect.poll(pixels).toBe(0)
  await button(page, 'Redo').click()
  await expect.poll(pixels).toBeGreaterThan(50)
  await page.screenshot({ path: test.info().outputPath('average-canvas.png') })
})
