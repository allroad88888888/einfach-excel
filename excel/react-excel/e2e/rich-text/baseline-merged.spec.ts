import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { downloadDateFile } from '../support/conditional-dates'
import { start, text, dialog, button, selectText, save } from '../support/rich-baseline'

async function editMerged(page: Page) {
  await start(page)
  const name = page.getByRole('textbox', { name: 'Name box', exact: true })
  await name.fill('B15'); await name.press('Enter'); await expect(name).toHaveValue('A15:D15')
  await showRibbonItem(page, 'format.rich-text'); await button(page, 'Rich text').click()
  await expect(dialog(page)).toHaveAccessibleName('Rich text · A15')
  await selectText(text(page), 7, 7); await button(dialog(page), 'Subscript').click(); await save(page)
  return page.locator('[data-merged-cell][data-cell="14:0"]')
}

test('merged anchor renders its selected subscript and restores the original text in one undo', async ({ page }) => {
  const anchor = await editMerged(page)
  await expect(anchor.locator('[data-font-baseline="subscript"]')).toHaveText('heading')
  await expect(anchor).toHaveText('Merged heading')
  await expect(anchor).toHaveAttribute('aria-colspan', '4')
  await expect(page.locator('td[data-cell="14:1"]')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('td[data-cell="14:4"]')).toHaveText('')
  await button(page, 'Undo').click()
  await expect(anchor.locator('[data-font-baseline]')).toHaveCount(0)
  await expect(anchor).toHaveText('Merged heading'); await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(anchor.locator('[data-font-baseline="subscript"]')).toHaveText('heading')
})

test('reopening a merged rich-text draft and saving unchanged retains every original run', async ({ page }) => {
  const anchor = await editMerged(page)
  const readRuns = async () => {
    const book = JSON.parse((await downloadDateFile(page)).toString()).workbook
    return book.richText.find((entry: { sheet: number; row: number; col: number }) =>
      entry.sheet === 1 && entry.row === 14 && entry.col === 0)?.runs
  }
  const before = await readRuns()
  expect(before).toEqual([{ text: 'Merged ', format: {} },
    { text: 'heading', format: { fontBaseline: 'subscript' } }])
  await showRibbonItem(page, 'format.rich-text'); await button(page, 'Rich text').click()
  await selectText(text(page), 7, 7)
  await expect(button(dialog(page), 'Subscript')).toHaveAttribute('aria-pressed', 'true')
  await save(page)
  expect(await readRuns()).toEqual(before)
  await expect(anchor.locator('[data-font-baseline="subscript"]')).toHaveText('heading')
  await button(page, 'Undo').click()
  await expect(anchor.locator('[data-font-baseline]')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
