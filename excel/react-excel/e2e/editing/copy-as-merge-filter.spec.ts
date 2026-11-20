import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

async function selectRange(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
}

async function copyAs(page: Page, format: 'text' | 'markdown' | 'html') {
  await showRibbonItem(page, 'clipboard.copy-as')
  const menu = page.getByRole('combobox', { name: 'Copy as' })
  await menu.selectOption(format)
  await expect(page.getByLabel('Clipboard status')).toContainText(`as ${format}.`)
  return page.evaluate(() => navigator.clipboard.readText())
}

test('CLIP-049: Copy as HTML, Markdown, and plain text emit merged rowspan/colspan, skip covered cells, and exclude filtered rows', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')

  // Merge K5:L8 (rows 4..7, cols 10..11) with anchor text "WestMerged" and adjacent values on M5 & M9
  const write = async (addr: string, val: string) => {
    await selectRange(page, addr)
    const bar = page.getByRole('textbox', { name: 'Active cell value' })
    await bar.fill(val)
    await bar.press('Enter')
  }
  await write('K5', 'WestMerged')
  await write('M5', 'Row5Keep')
  await write('M6', 'FilteredOutRow6')
  await write('M9', 'Row9Keep')

  await selectRange(page, 'K5:L9')
  await showRibbonItem(page, 'data.merge-cells')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  const mergeDialog = page.getByRole('alertdialog', { name: 'Merge these cells?' })
  await expect(mergeDialog).toBeVisible()
  await mergeDialog.getByRole('button', { name: 'Merge cells', exact: true }).click()
  await expect(mergeDialog).toHaveCount(0)

  // Filter Region (col 2 = C) == 'West': rows 5 & 9 stay visible, rows 6..8 are filtered out
  await showRibbonItem(page, 'data.worksheet-filter')
  const filterMenu = page.getByRole('combobox', { name: 'Worksheet filter' })
  await filterMenu.selectOption('open')
  const dialog = page.getByRole('dialog', { name: 'Filter conditions' })
  await dialog.getByLabel('Filter column 1', { exact: true }).selectOption('2')
  await dialog.getByLabel('Filter value 1', { exact: true }).fill('West')
  await dialog.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(page.getByLabel('Filter status')).toContainText('rows filtered out.')

  // Select K5:M9 (contains merged K5:L9 across 2 visible rows + 3 filtered rows)
  await selectRange(page, 'K5:M9')

  const tsv = await copyAs(page, 'text')
  expect(tsv).toBe('WestMerged\t\tRow5Keep\n\t\tRow9Keep')
  expect(tsv).not.toContain('FilteredOutRow6')

  const md = await copyAs(page, 'markdown')
  expect(md).toBe(['| WestMerged |  | Row5Keep |', '| --- | --- | --- |', '|  |  | Row9Keep |'].join('\n'))
  expect(md).not.toContain('FilteredOutRow6')

  await copyAs(page, 'html')
  const htmlInfo = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const html = await (await item.getType('text/html')).text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const rows = [...doc.querySelectorAll('tr')]
    const firstRowCells = [...(rows[0]?.querySelectorAll('td') ?? [])]
    const secondRowCells = [...(rows[1]?.querySelectorAll('td') ?? [])]
    return {
      html,
      rowCount: rows.length,
      firstRowCount: firstRowCells.length,
      anchorRowspan: firstRowCells[0]?.getAttribute('rowspan'),
      anchorColspan: firstRowCells[0]?.getAttribute('colspan'),
      anchorText: firstRowCells[0]?.textContent,
      secondRowCount: secondRowCells.length,
      secondRowText: secondRowCells[0]?.textContent,
    }
  })
  expect(htmlInfo.rowCount).toBe(2)
  expect(htmlInfo.firstRowCount).toBe(2)
  expect(htmlInfo.anchorRowspan).toBe('2')
  expect(htmlInfo.anchorColspan).toBe('2')
  expect(htmlInfo.anchorText).toBe('WestMerged')
  expect(htmlInfo.secondRowCount).toBe(1)
  expect(htmlInfo.secondRowText).toBe('Row9Keep')
  expect(htmlInfo.html).not.toContain('FilteredOutRow6')
})
