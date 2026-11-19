import { expect, test } from '@playwright/test'
import { downloadDateFile } from '../support/conditional-dates'
import { button, cell, go } from '../support/date-filter'
import { addReference, launchConsolidate, openConsolidate } from '../support/consolidate'

test('Consolidate combines 2D categories across sheets with one undo step', async ({ page }) => {
  await launchConsolidate(page)
  const panel = await openConsolidate(page, 'A1')
  await addReference(panel, 'Q1!A1:C3')
  await addReference(panel, 'Q2!A1:C3')
  await panel.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(panel.locator('[data-consolidate-preview]')).toContainText('Output: 4 × 3')
  await panel.getByRole('button', { name: 'Consolidate', exact: true }).click()
  await expect(panel).toHaveCount(0)

  await expect(cell(page, '0:0')).toHaveText('Item')
  await expect(cell(page, '0:1')).toHaveText('Sales')
  await expect(cell(page, '0:2')).toHaveText('Units')
  await expect(cell(page, '1:0')).toHaveText('Apples')
  await expect(cell(page, '1:1')).toHaveText('10')
  await expect(cell(page, '2:0')).toHaveText('Oranges')
  await expect(cell(page, '2:1')).toHaveText('50')
  await expect(cell(page, '2:2')).toHaveText('10')
  await expect(cell(page, '3:0')).toHaveText('Bananas')
  await expect(cell(page, '3:1')).toHaveText('15')
  await expect(cell(page, '3:2')).toHaveText('5')

  await button(page, 'Undo').click()
  await expect(cell(page, '2:1')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()

  await button(page, 'Redo').click()
  await expect(cell(page, '2:1')).toHaveText('50')
})

test('Consolidate by position previews alternate functions and gates overwrite confirmation', async ({
  page,
}) => {
  await launchConsolidate(page)
  const panel = await openConsolidate(page, 'F1')
  await panel.getByLabel('Function', { exact: true }).selectOption('average')
  await addReference(panel, 'Q1!B2:C3')
  await addReference(panel, 'Q2!B2:C3')
  await panel.getByLabel('Top row', { exact: true }).uncheck()
  await panel.getByLabel('Left column', { exact: true }).uncheck()
  await panel.getByRole('button', { name: 'Preview', exact: true }).click()

  const applyButton = panel.getByRole('button', { name: 'Consolidate', exact: true })
  await expect(applyButton).toBeDisabled()
  await panel.getByRole('checkbox', { name: /Overwrite 2 existing cells/i }).check()
  await expect(applyButton).toBeEnabled()
  await applyButton.click()
  await expect(panel).toHaveCount(0)

  // Q1 B2=10, Q2 B2=6 -> Average = 8; Q1 C2=2, Q2 C2=30 -> Average = 16
  await expect(cell(page, '0:5')).toHaveText('8')
  await expect(cell(page, '0:6')).toHaveText('16')
  // Q1 B3=20, Q2 B3=5 -> Average = 12.5; Q1 C3=4, Q2 C3=15 -> Average = 9.5
  await expect(cell(page, '1:5')).toHaveText('12.5')
  await expect(cell(page, '1:6')).toHaveText('9.5')
})

test('Linked consolidate creates live cross-sheet formulas, row outlines, and atomic undo', async ({
  page,
}) => {
  await launchConsolidate(page)
  const panel = await openConsolidate(page, 'A1')
  await addReference(panel, 'Q1!A1:B3')
  await addReference(panel, 'Q2!A1:B3')
  await panel.getByLabel('Create links to source data', { exact: true }).check()
  await panel.getByRole('button', { name: 'Preview', exact: true }).click()
  await panel.getByRole('button', { name: 'Consolidate', exact: true }).click()
  await expect(panel).toHaveCount(0)

  const saved = JSON.parse((await downloadDateFile(page)).toString())
  const summaryCells = saved.workbook.cells.filter(
    (entry: { sheet: number }) => entry.sheet === 2,
  )
  expect(summaryCells).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'formula', value: '=Q1!B2' }),
      expect.objectContaining({ kind: 'formula', value: expect.stringMatching(/^=SUM\(/) }),
    ]),
  )
  const summaryOutline = saved.workbook.outlines.find(
    (entry: { sheet: number }) => entry.sheet === 2,
  )
  expect(summaryOutline?.outline?.rows?.length).toBeGreaterThan(0)

  // Collapse row outline level 1 so only summary rows remain visible
  await button(page, 'Show row outline level 1').click()
  // Edit source Q1!B2 (Apples Sales: 10 -> 40) and verify Summary recalculates live
  await page.getByRole('tab', { name: 'Q1', exact: true }).click()
  await go(page, 'B2')
  await page.keyboard.type('40')
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveText('40')

  // Undo the source edit, then undo outline level, then undo consolidate atomically
  await button(page, 'Undo').click()
  await button(page, 'Undo').click()
  await button(page, 'Undo').click()
  await expect(cell(page, '0:0')).toHaveText('')
})

test('Consolidate rejects same-sheet links and stays absent without the optional plugin', async ({
  page,
}) => {
  await launchConsolidate(page)
  const panel = await openConsolidate(page, 'A1')
  await addReference(panel, 'Summary!F1:F2')
  await panel.getByLabel('Top row', { exact: true }).uncheck()
  await panel.getByLabel('Left column', { exact: true }).uncheck()
  await panel.getByLabel('Create links to source data', { exact: true }).check()
  await panel.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText(
    'Create links to source data requires sources on other worksheets.',
  )
  await expect(panel.getByRole('button', { name: 'Consolidate', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(page.locator('[data-ribbon-item="data.consolidate"]')).toHaveCount(0)
})
