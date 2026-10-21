import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, marker, editor, openNote, createNote, expectNeighbors } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const width of [1280, 390]) test.describe(`${width}px notes`, () => {
  test.use({ viewport: { width, height: 850 } })

  test(`insert multiline note preserves values and undoes once at ${width}px`, async ({ page }) => {
    await createNote(page)
    await expect(button(page, 'Note')).toBeFocused()
    await expectNeighbors(page)
    await button(page, 'Undo').click(); await expect(marker(page, '1:0')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click(); await expect(marker(page, '1:0')).toHaveCount(1)
    await openNote(page)
    await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('First line\n第二行')
  })

  test(`view existing note reads saved text without creating history at ${width}px`, async ({ page }) => {
    await createNote(page)
    await openNote(page)
    await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('First line\n第二行')
    await button(page, 'Cancel').click()
    await button(page, 'Undo').click(); await expect(marker(page, '1:0')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await expectNeighbors(page)
  })

  test(`edit note preserves original through native undo at ${width}px`, async ({ page }) => {
    await createNote(page); await openNote(page)
    await page.getByLabel('Note text', { exact: true }).fill('Updated\n中文🙂')
    await button(page, 'Save note').click(); await expect(editor(page)).toHaveCount(0)
    await openNote(page)
    await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('Updated\n中文🙂')
    await button(page, 'Cancel').click(); await button(page, 'Undo').click(); await openNote(page)
    await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('First line\n第二行')
    await button(page, 'Cancel').click(); await button(page, 'Redo').click()
    await expectNeighbors(page)
  })

  test(`delete note ignores unsaved draft and restores with undo at ${width}px`, async ({ page }) => {
    await createNote(page); await openNote(page)
    await page.getByLabel('Note text', { exact: true }).fill(' ')
    await button(page, 'Delete note').click(); await expect(marker(page, '1:0')).toHaveCount(0)
    await button(page, 'Undo').click(); await expect(marker(page, '1:0')).toHaveCount(1)
    await openNote(page)
    await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('First line\n第二行')
    await button(page, 'Cancel').click(); await button(page, 'Redo').click()
    await expect(marker(page, '1:0')).toHaveCount(0); await expectNeighbors(page)
  })

  test(`cancel note draft retains saved text and focus at ${width}px`, async ({ page }) => {
    await createNote(page); await openNote(page)
    await page.getByLabel('Note text', { exact: true }).fill('discard me')
    await button(page, 'Cancel').click(); await expect(button(page, 'Note')).toBeFocused()
    await openNote(page)
    await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('First line\n第二行')
    await button(page, 'Cancel').click(); await button(page, 'Undo').click()
    await expect(marker(page, '1:0')).toHaveCount(0); await expect(button(page, 'Undo')).toBeDisabled()
    await expectNeighbors(page)
  })

  test(`Escape dismisses note draft without saving at ${width}px`, async ({ page }) => {
    await select(page, 'A2', '1:0'); await openNote(page)
    await page.getByLabel('Note text', { exact: true }).fill('discard')
    await page.getByLabel('Note text', { exact: true }).press('Escape')
    await expect(editor(page)).toHaveCount(0); await expect(button(page, 'Note')).toBeFocused()
    await expect(marker(page, '1:0')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled(); await expectNeighbors(page)
  })

  test(`blank note text keeps a retryable draft at ${width}px`, async ({ page }) => {
    await select(page, 'A2', '1:0'); await openNote(page)
    await page.getByLabel('Note text', { exact: true }).fill(' \n\t')
    await button(page, 'Insert note').click()
    await expect(editor(page).getByRole('alert')).toContainText('Enter note text')
    await expect(button(page, 'Undo')).toBeDisabled()
    await page.getByLabel('Note text', { exact: true }).fill('recovered')
    await button(page, 'Insert note').click(); await expect(marker(page, '1:0')).toHaveCount(1)
    await expectNeighbors(page)
  })

  test(`over-limit note text keeps a retryable draft at ${width}px`, async ({ page }) => {
    await select(page, 'A2', '1:0'); await openNote(page)
    await page.getByLabel('Note text', { exact: true }).fill('a'.repeat(32768))
    await button(page, 'Insert note').click()
    await expect(editor(page).getByRole('alert')).toHaveText('Note text cannot exceed 32767 characters.')
    await expect(button(page, 'Undo')).toBeDisabled()
    await page.getByLabel('Note text', { exact: true }).fill('recovered')
    await button(page, 'Insert note').click(); await expect(marker(page, '1:0')).toHaveCount(1)
    await expectNeighbors(page)
  })

  test(`note on formula and blank cell preserves native content at ${width}px`, async ({ page }) => {
    // 原种子 K3 是日期；经真实输入提交并等待原生投影，明确准备空白格。
    await select(page, 'K3', '2:10')
    await expect(cell(page, '2:10')).toHaveText('2026-09-04')
    const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await input.fill(''); await input.press('Enter')
    await expect(cell(page, '2:10')).toHaveText('')
    await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
    await createNote(page, 'G2', '1:6', 'Formula note')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
    await expect(cell(page, '1:6')).toHaveText('79')
    await createNote(page, 'K3', '2:10', 'Blank cell note')
    await expect(cell(page, '2:10')).toHaveText('')
    await openNote(page); await expect(page.getByLabel('Note text', { exact: true })).toHaveValue('Blank cell note')
    await button(page, 'Cancel').click(); await button(page, 'Undo').click()
    await expect(marker(page, '2:10')).toHaveCount(0)
    await expect(cell(page, '2:10')).toHaveText('')
    await select(page, 'G2', '1:6'); await expect(marker(page, '1:6')).toHaveCount(1)
    await select(page, 'A2', '1:0')
    await expectNeighbors(page)
  })

  test(`note dialog traps focus and fits viewport at ${width}px`, async ({ page }, testInfo) => {
    await createNote(page); await openNote(page)
    const input = page.getByLabel('Note text', { exact: true })
    await input.press('Shift+Tab'); await expect(button(page, 'Save note')).toBeFocused()
    await button(page, 'Save note').press('Tab'); await expect(input).toBeFocused()
    const bounds = await editor(page).boundingBox()
    expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`notes-${width}.png`) })
    await input.press('Escape'); await expectNeighbors(page)
  })
})
