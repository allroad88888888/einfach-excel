import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { dateButton as button, dateCell as cell, openDateRules as openRules,
  openDateFile as openFile } from '../support/conditional-dates'
import { addAverageRule, averageDomainFile } from '../support/conditional-average'

async function summary(page: Page) {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A14:F14', '13:0')
}

for (const direction of ['above', 'below'] as const) {
  test(`${direction} average highlights the complete numeric domain and undoes once`, async ({ page }) => {
    await summary(page)
    const before = await Promise.all([0, 1, 2, 3, 4, 5].map(col =>
      cell(page, `13:${col}`).evaluate(node => ({ color: getComputedStyle(node).backgroundColor, text: node.textContent }))))
    expect(before[2].color).toBe('rgb(226, 240, 217)')
    expect(before[3].color).toBe('rgb(226, 240, 217)')
    const neighbor = await cell(page, '12:1').textContent()
    await addAverageRule(page, 'A14:F14', direction)
    const matches = direction === 'above' ? [2, 3] : [0, 1]
    for (let col = 0; col < 6; col++) {
      await expect(cell(page, `13:${col}`)).toHaveCSS('background-color',
        matches.includes(col) ? 'rgb(0, 255, 0)' : before[col].color)
      await expect(cell(page, `13:${col}`)).toHaveText(before[col].text ?? '')
    }
    await expect(cell(page, '12:1')).toHaveText(neighbor ?? '')
    await expect(cell(page, '12:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
    await button(page, 'Undo').click()
    for (let col = 0; col < 6; col++)
      await expect(cell(page, `13:${col}`)).toHaveCSS('background-color', before[col].color)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, `13:${matches[0]}`)).toHaveCSS('background-color', 'rgb(0, 255, 0)')
    await select(page, 'D14', '13:3')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=B14*2')
  })
}

test('include equal average updates the same rule and preserves strict neighbors', async ({ page }) => {
  await summary(page)
  await addAverageRule(page, 'A14:C14') // mean 10, B14 initially excluded
  await expect(cell(page, '13:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await openRules(page)
  await button(page, 'Edit rule 1').click()
  await page.getByLabel('Include equal average').check()
  await button(page, 'Save rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '13:1')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '13:2')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '13:0')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '13:3')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await button(page, 'Undo').click()
  await expect(cell(page, '13:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await button(page, 'Redo').click()
  await expect(cell(page, '13:1')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
})

test('average spans disjoint hidden and offscreen cells and follows formula edits', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, averageDomainFile())
  await select(page, 'C1', '0:2')
  await showRibbonItem(page, 'view.row-and-column-visibility')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-columns')
  await select(page, 'A1:A7', '0:0')
  await addAverageRule(page, 'A1:A7, C1:C1000') // mean 12 includes hidden C1 and offscreen C900
  for (let row = 0; row < 7; row++)
    await expect(cell(page, `${row}:0`)).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '0:1')).toHaveText('-9999')
  await expect(cell(page, '0:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await select(page, 'D1', '0:3')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('0')
  await formula.press('Enter') // mean 7, A2 is now above it
  await select(page, 'A2', '1:0')
  await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await button(page, 'Undo').click()
  await expect(cell(page, '1:0')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
})

test('average fields save below-or-equal on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await summary(page)
  await openRules(page)
  await page.getByLabel('Applies to', { exact: true }).fill('A14:C14')
  await page.getByLabel('Rule type').selectOption('above-average')
  await page.getByLabel('Average comparison').selectOption('below')
  await page.getByLabel('Include equal average').check()
  await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00')
  const dialog = page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('mean-mobile.png') })
  await button(page, 'Add rule').click()
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '13:0')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '13:1')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '13:2')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
})
