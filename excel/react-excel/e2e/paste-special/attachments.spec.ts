import { expect, test } from '@playwright/test'
import { copy, pasteOption, select } from '../support/clipboard'
import { button, cell, createNote, marker } from '../notes/fixtures'
import { configure, edit, start } from '../advanced-validation/support'

test('paste notes only copies the note and keeps the destination value', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await createNote(page, 'A2', '1:0', 'Check stock')
  await select(page, 'A2', '1:0')
  await copy(page)
  await select(page, 'D5', '4:3')
  const before = await cell(page, '4:3').textContent()
  await pasteOption(page, 'notes')
  await expect(marker(page, '4:3')).toHaveCount(1)
  await expect(cell(page, '4:3')).toHaveText(before ?? '')
  await button(page, 'Undo').click()
  await expect(marker(page, '4:3')).toHaveCount(0)
  await expect(marker(page, '1:0')).toHaveCount(1)
})

test('paste validation only applies the rule with references moved to the destination', async ({ page }) => {
  await start(page)
  await configure(page, { formula: '=D45>0' })
  await edit(page, 'D45', '44:3', '5')
  await select(page, 'D45', '44:3')
  await copy(page)
  await select(page, 'F45', '44:5')
  await pasteOption(page, 'validation')
  await edit(page, 'F45', '44:5', '-3')
  await expect(page.getByText('Enter a positive quantity.', { exact: true })).toBeVisible()
})
