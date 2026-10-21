import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, marker, timeline, openComments, createComment, closeComments, reply,
  download, openFile, expectNeighbors } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('downloaded workbook preserves comment authors timestamps messages and status events', async ({ page }) => {
  await createComment(page); await openComments(page); await reply(page)
  await button(page, 'Resolve discussion').click(); await expect(button(page, 'Reopen discussion')).toBeEnabled()
  const dates = await timeline(page).locator('time').evaluateAll(nodes => nodes.map(node => (node as HTMLTimeElement).dateTime))
  await closeComments(page)
  const file = await download(page)
  const saved = file.workbook.comments.find((entry: { sheet: number; row: number; col: number }) =>
    entry.sheet === 0 && entry.row === 1 && entry.col === 0)
  expect(saved.thread.resolved).toBe(true)
  expect(saved.thread.entries.map((entry: { kind: string }) => entry.kind)).toEqual(['message', 'message', 'resolve'])
  expect(saved.thread.entries.map((entry: { author: string }) => entry.author)).toEqual(['Alice', 'Bob', 'Bob'])
  expect(saved.thread.entries.map((entry: { createdAt: number }) => new Date(entry.createdAt).toISOString())).toEqual(dates)
  expect(saved.thread.entries[0].body).toBe('First line\n第二行🙂')
  expect(file.workbook.cells.find((entry: { sheet: number; row: number; col: number }) =>
    entry.sheet === 0 && entry.row === 1 && entry.col === 6)).toMatchObject({ kind: 'formula', value: '=E2*F2' })
  await expectNeighbors(page)
})

test('opening workbook restores the complete thread and keeps formulas and neighbors', async ({ page }) => {
  await createComment(page, 'G2', '1:6', 'Saved discussion'); await openComments(page)
  await reply(page); await button(page, 'Resolve discussion').click()
  await expect(button(page, 'Reopen discussion')).toBeEnabled(); await closeComments(page)
  const file = await download(page)
  await openComments(page); await button(page, 'Reopen discussion').click()
  await expect(button(page, 'Post reply')).toBeEnabled(); await closeComments(page)
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await select(page, 'G2', '1:6'); await openComments(page)
  await expect(timeline(page).locator('li')).toHaveCount(3)
  await expect(timeline(page)).toContainText('Saved discussion'); await expect(timeline(page)).toContainText('Bob')
  await expect(button(page, 'Post reply')).toBeDisabled()
  await closeComments(page)
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
  await expect(button(page, 'Undo')).toBeDisabled(); await expectNeighbors(page)
})

test('invalid comment file leaves the currently open workbook intact', async ({ page }) => {
  await createComment(page)
  const file = await download(page)
  file.workbook.comments.push({ sheet: 0, row: 2, col: 2, thread: { entries: [], resolved: false } })
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' }).getByRole('alert')).toContainText('Current workbook kept')
  await button(page, 'Close').click(); await expect(marker(page, '1:0')).toHaveCount(1)
  await openComments(page); await expect(timeline(page)).toContainText('First line\n第二行🙂')
  await closeComments(page); await expectNeighbors(page)
})

test('legacy workbook without comments restores no thread and preserves ordinary data', async ({ page }) => {
  await createComment(page)
  const file = await download(page)
  delete file.workbook.comments
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await select(page, 'A2', '1:0'); await expect(marker(page, '1:0')).toHaveCount(0)
  await openComments(page); await expect(page.getByText(/No comments yet/)).toBeVisible()
  await closeComments(page); await expect(button(page, 'Undo')).toBeDisabled(); await expectNeighbors(page)
})
