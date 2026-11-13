import { expect, test } from '@playwright/test'
import { start, save, open, configure, apply, records, cell, panel, button } from '../support/custom-list-sort'

const original = ['M1', 'M2', 'M3', 'M4', 'P1', 'empty-a', 'empty-b']
for (const [action, caseSensitive, emptyFirst, expected] of [
  ['case', true, false, ['P1', 'M1', 'M2', 'M4', 'M3', 'empty-a', 'empty-b']],
  ['empty-first', false, true, ['empty-a', 'empty-b', 'P1', 'M1', 'M2', 'M3', 'M4']],
  ['empty-last', false, false, ['P1', 'M1', 'M2', 'M3', 'M4', 'empty-a', 'empty-b']],
] as const) test(`list sort ${action} uses native options without trimming cell values`, async ({ page }) => {
  await start(page); await save(page, 'Trees', 'Pine\nMaple')
  await open(page, 'D32:F39', '31:3'); await configure(page, 'Trees')
  await panel(page).getByLabel('Case sensitive', { exact: true }).setChecked(!caseSensitive)
  await panel(page).getByLabel('Case sensitive', { exact: true }).setChecked(caseSensitive)
  await panel(page).getByLabel('Empty cell position').selectOption(emptyFirst ? 'last' : 'first')
  await panel(page).getByLabel('Empty cell position').selectOption(emptyFirst ? 'first' : 'last')
  await apply(page); await records(page, expected, 32, 5)
  await expect(cell(page, '31:3')).toHaveText('Key')
  await expect(cell(page, '31:2')).toHaveText('')
  await button(page, 'Undo').click(); await records(page, original, 32, 5)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click(); await records(page, expected, 32, 5)
})
