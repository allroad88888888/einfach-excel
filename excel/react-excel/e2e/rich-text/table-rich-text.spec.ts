import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { button, dialog, save, selectText, text } from '../support/rich-baseline'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formulaInput = (page: Page) =>
  page.getByRole('textbox', { name: 'Active cell value', exact: true })

async function selectAddress(page: Page, address: string) {
  const box = page.getByRole('textbox', { name: 'Name box', exact: true })
  await box.fill(address)
  await box.press('Enter')
  await expect(box).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
}

async function setupTeamTable(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await selectAddress(page, 'A25:C29')
  await expect(cell(page, '24:0')).toHaveText('Team')
  await expect(cell(page, '25:0')).toHaveText('West')

  await showRibbonItem(page, 'insert.tables')
  await button(page, 'Tables').click()
  const tablesDialog = page.getByRole('dialog', { name: 'Tables', exact: true })
  await expect(tablesDialog).toBeVisible()
  await tablesDialog.getByLabel('Table name', { exact: true }).fill('TeamTable')
  await tablesDialog.getByRole('button', { name: 'Create table', exact: true }).click()
  await expect(tablesDialog).toHaveCount(0)
}

async function openRichText(page: Page, address: string) {
  await selectAddress(page, address)
  await showRibbonItem(page, 'format.rich-text')
  await button(page, 'Rich text').click()
  await expect(dialog(page)).toHaveAccessibleName(`Rich text · ${address}`)
}

test('TABLERICH-001: table data cell supports rich text editing with atomic undo and redo', async ({
  page,
}) => {
  await setupTeamTable(page)

  await openRichText(page, 'A26')
  await text(page).fill('West Region')
  await selectText(text(page), 0, 4)
  await button(dialog(page), 'Bold').click()
  await save(page)

  const target = cell(page, '25:0')
  await expect(target).toHaveText('West Region')
  const runs = target.locator('.cell-content > span')
  await expect(runs).toHaveCount(2)
  await expect(runs.nth(0)).toHaveText('West')
  await expect(runs.nth(0)).toHaveCSS('font-weight', '700')
  await expect(runs.nth(1)).toHaveText(' Region')

  await button(page, 'Undo').click()
  await expect(target).toHaveText('West')
  await expect(target.locator('.cell-content > span')).toHaveCount(0)

  await button(page, 'Redo').click()
  await expect(target).toHaveText('West Region')
  await expect(target.locator('.cell-content > span').first()).toHaveCSS('font-weight', '700')
})

test('TABLERICH-002: table header rich text renames column, rewrites structured refs, and rejects duplicates', async ({
  page,
}) => {
  await setupTeamTable(page)

  // Add a structured-reference formula referencing TeamTable[Team]
  await selectAddress(page, 'E25')
  await formulaInput(page).fill('=COUNTA(TeamTable[Team])')
  await formulaInput(page).press('Enter')
  await expect(cell(page, '24:4')).toHaveText('4')

  // Duplicate column name is rejected cleanly inside the dialog
  await openRichText(page, 'A25')
  await text(page).fill('Score')
  await button(dialog(page), 'Save changes').click()
  await expect(dialog(page).getByRole('alert')).toBeVisible()

  // Valid rich-text header rename updates both inline runs and structured references
  await text(page).fill('Sales Team')
  await selectText(text(page), 0, 5)
  await button(dialog(page), 'Italic').click()
  await save(page)

  const header = cell(page, '24:0')
  await expect(header).toContainText('Sales Team')
  const headerRuns = header.locator('.cell-content > span')
  await expect(headerRuns.nth(0)).toHaveText('Sales')
  await expect(headerRuns.nth(0)).toHaveCSS('font-style', 'italic')

  await selectAddress(page, 'E25')
  await expect(formulaInput(page)).toHaveValue('=COUNTA(TeamTable[Sales Team])')
  await expect(cell(page, '24:4')).toHaveText('4')

  // Single undo restores both the old header name and structured reference formula
  await button(page, 'Undo').click()
  await expect(header).toContainText('Team')
  await selectAddress(page, 'E25')
  await expect(formulaInput(page)).toHaveValue('=COUNTA(TeamTable[Team])')
})

test('TABLERICH-003: table rich text survives native workbook download and reopen', async ({
  page,
}) => {
  await setupTeamTable(page)

  await openRichText(page, 'A26')
  await text(page).fill('West North')
  await selectText(text(page), 0, 4)
  await button(dialog(page), 'Bold').click()
  await save(page)

  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const file = await downloading
  const savedJson = await readFile((await file.path())!, 'utf8')
  await button(page, 'Close').click()

  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'File').click()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'TableRichText.einfach.json',
    mimeType: 'application/json',
    buffer: Buffer.from(savedJson),
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await selectAddress(page, 'A26')
  const restored = cell(page, '25:0')
  await expect(restored).toHaveText('West North')
  const runs = restored.locator('.cell-content > span')
  await expect(runs).toHaveCount(2)
  await expect(runs.nth(0)).toHaveText('West')
  await expect(runs.nth(0)).toHaveCSS('font-weight', '700')
})
