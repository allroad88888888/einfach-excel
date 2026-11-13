import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { dateButton as button, dateCell as cell, openDateRules as openRules } from '../support/conditional-dates'
import { addStateRule, stateMatches, stateCoord, type StateCondition } from '../support/conditional-cell-state'

for (const condition of Object.keys(stateMatches) as StateCondition[]) {
  test(`${condition} conditional formatting distinguishes native cell states and undoes once`, async ({ page }) => {
    await page.goto('/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'A35:C38', '34:0')
    const before = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      cell(page, stateCoord(i)).evaluate(node => ({
        color: getComputedStyle(node).backgroundColor, text: node.textContent,
      }))))
    for (const i of stateMatches.blank) expect(before[i].color).toBe('rgb(226, 240, 217)')
    for (const i of stateMatches.error) expect(before[i].color).toBe('rgb(255, 199, 206)')
    await addStateRule(page, 'A35:C38', condition)
    for (let i = 0; i < 12; i++) {
      await expect(cell(page, stateCoord(i))).toHaveCSS('background-color',
        (stateMatches[condition] as readonly number[]).includes(i) ? 'rgb(0, 255, 0)' : before[i].color)
      await expect(cell(page, stateCoord(i))).toHaveText(before[i].text ?? '')
    }
    await expect(cell(page, '34:3')).toHaveText('maple')
    await expect(cell(page, '34:3')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
    await button(page, 'Undo').click()
    for (let i = 0; i < 12; i++)
      await expect(cell(page, stateCoord(i))).toHaveCSS('background-color', before[i].color)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, stateCoord(stateMatches[condition][0])))
      .toHaveCSS('background-color', 'rgb(0, 255, 0)')
    await select(page, 'C35', '34:2')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=""')
    await openRules(page)
    await button(page, 'Edit rule 1').click()
    await expect(page.getByLabel('Cell condition')).toHaveValue(condition)
    await expect(page.getByLabel('Applies to')).toHaveValue('A35:C38')
  })
}

test('cell state rules react to error dependencies and keep non-blank separate from errors', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B36', '35:1')
  const editor = page.getByRole('textbox', { name: 'Active cell value' })
  await editor.fill('=1/A37')
  await editor.press('Enter')
  await addStateRule(page, 'B36', 'not-blank')
  await expect(cell(page, '35:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await select(page, 'A37', '36:0')
  await editor.fill('2')
  await editor.press('Enter')
  await expect(cell(page, '35:1')).toHaveText('0.5')
  await expect(cell(page, '35:1')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await button(page, 'Undo').click()
  await expect(cell(page, '35:1')).toHaveText('#DIV/0!')
  await expect(cell(page, '35:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
})

test('cell state controls save through the narrow screen dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A35:C38', '34:0')
  await openRules(page)
  await page.getByLabel('Rule type').selectOption('cell-state')
  await page.getByLabel('Cell condition').selectOption('error')
  await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00')
  const dialog = page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('state-mobile.png') })
  await button(page, 'Add rule').click()
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '35:1')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '34:0')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
})
