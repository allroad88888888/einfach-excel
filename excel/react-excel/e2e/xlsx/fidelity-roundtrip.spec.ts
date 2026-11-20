import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import {
  closeComments,
  editor as commentsDialog,
  marker,
  openComments,
  timeline,
} from '../comments/fixtures'
import { closeProtection, expectLockedInput, input, openProtection, panel } from '../protection/support'
import { menuItem, openTabMenu, tab, tabs } from '../sheet-management/support'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fidelity-roundtrip.xlsx',
)
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const fileDialog = (page: Page) => page.getByRole('dialog', { name: 'Workbook files' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function openXlsx(page: Page, name: string, buffer: Buffer) {
  await button(page, 'File').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page
    .getByLabel('Open workbook', { exact: true })
    .setInputFiles({ name, mimeType: XLSX_MIME, buffer })
  await expect(fileDialog(page)).toHaveCount(0)
}

async function downloadXlsx(page: Page) {
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await fileDialog(page).getByRole('button', { name: 'Download as Excel (.xlsx)' }).click()
  const saved = await pending
  const bytes = await readFile((await saved.path())!)
  const statusText = (await fileDialog(page).getByRole('status').textContent()) ?? ''
  await fileDialog(page).getByRole('button', { name: 'Close', exact: true }).click()
  return { bytes, statusText }
}

async function expectIconsAndRotations(page: Page) {
  // 3Arrows reversed on A2:A4 (values 5, 25, 80 against thresholds 15, 50) -> indices 2, 1, 0 with value hidden
  for (const [row, expectedIdx] of [
    [1, '2'],
    [2, '1'],
    [3, '0'],
  ] as const) {
    const iconEl = cell(page, `${row}:0`).locator('[data-conditional-icon]')
    await expect(iconEl).toHaveCount(1)
    await expect(iconEl).toHaveAttribute('data-icon-index', expectedIdx)
    await expect(cell(page, `${row}:0`).locator('[data-conditional-icon-value="hidden"]')).toHaveCSS(
      'opacity',
      '0',
    )
  }

  await showRibbonItem(page, 'format.text-rotation')
  const rotationSelect = page.getByRole('combobox', { name: 'Text rotation', exact: true })
  await select(page, 'F1', '0:5')
  await expect(rotationSelect).toHaveValue('45')
  await select(page, 'G1', '0:6')
  await expect(rotationSelect).toHaveValue('-45')
  await select(page, 'H1', '0:7')
  await expect(rotationSelect).toHaveValue('vertical')
}

test('XLSX-007: icon sets, threaded comments and cell rotation import cleanly and survive Excel re-export', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/?locale=en-US')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  await openXlsx(page, 'fidelity-roundtrip.xlsx', await readFile(fixturePath))
  await expect(page.getByRole('status', { name: 'Workbook file status' })).toHaveCount(0)

  await expectIconsAndRotations(page)

  // Threaded comment on D2 (1:3): @Bob prefix stripped, reply preserved, resolved state restored
  await select(page, 'D2', '1:3')
  await expect(marker(page, '1:3')).toHaveCount(1)
  await openComments(page)
  await expect(timeline(page)).toContainText('Alice')
  await expect(timeline(page)).toContainText('Please check D2')
  await expect(timeline(page)).not.toContainText('@Bob')
  await expect(timeline(page)).toContainText('Bob')
  await expect(timeline(page)).toContainText('Looks good')
  await expect(timeline(page)).toContainText('Resolved this discussion')
  await expect(commentsDialog(page).getByRole('status')).toHaveText('Resolved')
  await closeComments(page)

  // Export to Excel: only threaded comments -> notes downgrade is reported; icons & rotation export cleanly
  const firstExport = await downloadXlsx(page)
  expect(firstExport.statusText).toContain('threaded comments exported as notes')
  expect(firstExport.statusText).not.toContain('text rotation')
  expect(firstExport.statusText).not.toContain('conditional formats')

  await openXlsx(page, 'reexported.xlsx', firstExport.bytes)
  await expectIconsAndRotations(page)
  await expect(cell(page, '1:3').locator('[data-cell-note]')).toHaveCount(1)
})

test('XLSX-008: worksheet protection, row and column outlines, hidden sheet and tab color roundtrip through Excel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/?locale=en-US')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  await openXlsx(page, 'fidelity-roundtrip.xlsx', await readFile(fixturePath))
  const { bytes } = await downloadXlsx(page)
  await openXlsx(page, 'roundtripped.xlsx', bytes)

  // Hidden sheet stays hidden and active Dashboard tab preserves its #FF8800 tab color
  await expect(tabs(page)).toHaveText(['Dashboard'])
  await expect(tab(page, 'Dashboard')).toHaveAttribute('data-tab-color', '#FF8800')

  // Protection dialog preserves unlocked ranges (E2:E3 and D2) and Sort + Insert rows permissions
  await openProtection(page)
  await expect(button(page, 'Unprotect worksheet')).toBeEnabled()
  await expect(button(page, 'Remove editable range E2:E3')).toBeVisible()
  await expect(button(page, 'Remove editable range D2')).toBeVisible()
  await expect(panel(page).getByRole('checkbox', { name: 'Sort editable ranges', exact: true })).toBeChecked()
  await expect(panel(page).getByRole('checkbox', { name: 'Insert rows', exact: true })).toBeChecked()
  await expect(panel(page).getByRole('checkbox', { name: 'Delete rows', exact: true })).not.toBeChecked()
  await closeProtection(page)

  // Locked cell A1 blocks edit; unlocked cell D2 permits edit
  await select(page, 'A1', '0:0')
  await expectLockedInput(page)
  await select(page, 'D2', '1:3')
  await input(page, '99')
  await expect(cell(page, '1:3')).toHaveText('99')

  // Unprotect worksheet so outline collapse/expand and Unhide can be exercised
  await openProtection(page)
  await button(page, 'Unprotect worksheet').click()
  await closeProtection(page)

  // Row and column outline level buttons collapse and expand grouped rows (2..3) and columns (B..C)
  await button(page, 'Show row outline level 1').click()
  await expect(cell(page, '1:1')).toHaveCount(0)
  await button(page, 'Show row outline level 2').click()
  await expect(cell(page, '1:1')).toHaveText('100')

  await button(page, 'Show column outline level 1').click()
  await expect(cell(page, '0:1')).toHaveCount(0)
  await button(page, 'Show column outline level 2').click()
  await expect(cell(page, '0:1')).toHaveText('Q1')

  // Unhide Archived sheet and verify its #3366CC tab color
  await openTabMenu(page, 'Dashboard')
  await menuItem(page, 'Unhide…').click()
  const unhideDialog = page.getByRole('dialog', { name: 'Unhide worksheet' })
  await expect(unhideDialog.getByRole('option')).toHaveText(['Archived'])
  await unhideDialog.getByRole('option', { name: 'Archived' }).click()
  await unhideDialog.getByRole('button', { name: 'OK' }).click()
  await expect(tabs(page)).toHaveText(['Dashboard', 'Archived'])
  await expect(tab(page, 'Archived')).toHaveAttribute('data-tab-color', '#3366CC')
})
