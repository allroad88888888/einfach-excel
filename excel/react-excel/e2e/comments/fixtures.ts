import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const marker = (page: Page, coord: string) => cell(page, coord).locator('[data-cell-comment]')
export const editor = (page: Page) => page.getByRole('dialog', { name: 'Cell comments', exact: true })
export const timeline = (page: Page) => editor(page).getByRole('list', { name: 'Comment history', exact: true })
export const author = (page: Page) => page.getByLabel('Workbook display name', { exact: true })
export const body = (page: Page, existing = true) => page.getByLabel(existing ? 'Reply text' : 'Comment text', { exact: true })

export async function openComments(page: Page) {
  await button(page, 'Comments').click()
  await expect(editor(page)).toBeVisible()
  await expect(author(page)).toBeEnabled()
}
export async function createComment(page: Page, address = 'A2', coord = '1:0', text = 'First line\n第二行🙂') {
  await select(page, address, coord)
  await openComments(page)
  await author(page).fill('Alice')
  await body(page, false).fill(text)
  await button(page, 'New comment').click()
  await expect(timeline(page).locator('li')).toHaveCount(1)
  await closeComments(page)
  await expect(marker(page, coord)).toHaveCount(1)
}
export async function closeComments(page: Page) {
  await button(page, 'Close comments').click()
  await expect(editor(page)).toHaveCount(0)
}
export async function reply(page: Page, text = 'Please review', name = 'Bob') {
  await author(page).fill(name); await body(page).fill(text)
  await button(page, 'Post reply').click()
  await expect(timeline(page).getByText(text, { exact: true })).toBeVisible()
}
export async function expectNeighbors(page: Page) {
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(cell(page, '2:0')).toHaveText('SO-10002')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '1:6')).toHaveText('79')
}
export async function download(page: Page) {
  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const downloaded = await downloading
  const file = JSON.parse(await readFile((await downloaded.path())!, 'utf8'))
  await button(page, 'Close').click()
  return file
}
export async function openFile(page: Page, file: unknown) {
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({ name: 'Comments.einfach.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
}
