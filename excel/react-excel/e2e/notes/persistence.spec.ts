import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, marker, editor, openNote, createNote } from './fixtures'

async function download(page: Page) {
  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const downloaded = await downloading
  const text = await readFile((await downloaded.path())!, 'utf8')
  await button(page, 'Close').click()
  return JSON.parse(text)
}
async function openFile(page: Page, file: unknown) {
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({ name: 'Notes.einfach.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('note file roundtrip restores multiline metadata and leaves cell formulas intact', async ({ page }) => {
  await createNote(page, 'G2', '1:6', 'Saved\n中文🙂')
  const file = await download(page)
  expect(file.workbook.notes).toContainEqual({ sheet: 0, row: 1, col: 6, text: 'Saved\n中文🙂' })
  await openNote(page); await button(page, 'Delete note').click()
  await expect(marker(page, '1:6')).toHaveCount(0)
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await select(page, 'G2', '1:6'); await expect(marker(page, '1:6')).toHaveCount(1)
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
  await openNote(page); await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('Saved\n中文🙂')
  await button(page, 'Cancel').click(); await expect(cell(page, '2:6')).toHaveText('658')
})

test('invalid note file keeps open workbook and legacy file restores no notes', async ({ page }) => {
  await createNote(page)
  const file = await download(page)
  file.workbook.notes.push({ sheet: 0, row: 4, col: 1, text: ' ' })
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' }).getByRole('alert')).toContainText('Current workbook kept')
  await button(page, 'Close').click(); await expect(marker(page, '1:0')).toHaveCount(1)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  delete file.workbook.notes
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await expect(marker(page, '1:0')).toHaveCount(0)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('native row and column edits move notes and restore them through undo', async ({ page }) => {
  await select(page, 'B2', '1:1'); await expect(marker(page, '1:1')).toHaveCount(1)
  await openNote(page)
  const seedText = await page.getByLabel('Note text', { exact: true }).inputValue()
  expect(seedText).not.toBe('')
  expect(seedText).not.toBe('First line\n第二行')
  await button(page, 'Cancel').click()
  await createNote(page)
  const structure = page.getByRole('combobox', { name: 'Insert or delete rows and columns' })
  await structure.selectOption('insert-rows')
  await expect(marker(page, '1:0')).toHaveCount(0)
  await expect(marker(page, '2:0')).toHaveCount(1)
  await expect(cell(page, '2:0')).toHaveText('SO-10001')
  await button(page, 'Undo').click(); await expect(marker(page, '1:0')).toHaveCount(1)
  await select(page, 'A2', '1:0'); await structure.selectOption('delete-columns')
  // 删除 A 列会移除新备注，但 B2 的种子备注应随原单元格移到 A2。
  await expect(cell(page, '1:0')).toHaveText('Acme Co.')
  await expect(marker(page, '1:0')).toHaveCount(1)
  await select(page, 'A2', '1:0'); await openNote(page)
  await expect(page.getByLabel('Note text', { exact: true })).toHaveValue(seedText)
  await expect(page.getByLabel('Note text', { exact: true })).not.toHaveValue('First line\n第二行')
  await button(page, 'Cancel').click(); await button(page, 'Undo').click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(marker(page, '1:0')).toHaveCount(1)
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(marker(page, '1:1')).toHaveCount(1)
  await select(page, 'A2', '1:0'); await openNote(page)
  await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('First line\n第二行')
  await button(page, 'Cancel').click()
  await select(page, 'B2', '1:1'); await openNote(page)
  await expect(page.getByLabel('Note text', { exact: true })).toHaveValue(seedText)
  await button(page, 'Cancel').click()
})

test('ordinary cell input preserves note independently of value undo', async ({ page }) => {
  await createNote(page)
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Updated order'); await input.press('Enter')
  await expect(cell(page, '1:0')).toHaveText('Updated order')
  await expect(marker(page, '1:0')).toHaveCount(1)
  await button(page, 'Undo').click(); await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(marker(page, '1:0')).toHaveCount(1)
  await select(page, 'A2', '1:0'); await openNote(page)
  await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('First line\n第二行')
  await button(page, 'Cancel').click(); await expect(editor(page)).toHaveCount(0)
})
