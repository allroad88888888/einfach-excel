import { expect, test } from '@playwright/test'
import { button, cell, dragBorder, nameBox, preview, select, start } from './support'

test.beforeEach(async ({ page }) => { await start(page) })

test('escape during a border drag cancels without moving cells', async ({ page }) => {
  await select(page, 'A1:A2', '0:0')
  await dragBorder(page, '0:0', '4:5', { release: false })
  await page.keyboard.press('Escape')
  await expect(preview(page)).toBeHidden()
  await page.mouse.up()
  await expect(cell(page, '0:0')).toHaveText('2')
  await expect(cell(page, '4:5')).toHaveText('')
  await expect(nameBox(page)).toHaveValue('A1:A2')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('declining the replace prompt keeps both the source and the existing data', async ({ page }) => {
  await select(page, 'A1:A2', '0:0')
  const prompts: string[] = []
  page.once('dialog', async (dialog) => {
    prompts.push(dialog.message())
    await dialog.dismiss()
  })
  await dragBorder(page, '0:0', '4:4')
  await expect.poll(() => prompts).toEqual(["There's already data here. Do you want to replace it?"])
  await expect(cell(page, '5:4')).toHaveText('keep')
  await expect(cell(page, '0:0')).toHaveText('2')
  await expect(nameBox(page)).toHaveValue('A1:A2')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('accepting the replace prompt overwrites the existing data', async ({ page }) => {
  await select(page, 'A1:A2', '0:0')
  page.once('dialog', (dialog) => dialog.accept())
  await dragBorder(page, '0:0', '4:4')
  await expect(cell(page, '5:4')).toHaveText('3')
  await expect(cell(page, '4:4')).toHaveText('2')
  await expect(cell(page, '0:0')).toHaveText('')
  await expect(nameBox(page)).toHaveValue('E5:E6')
})
