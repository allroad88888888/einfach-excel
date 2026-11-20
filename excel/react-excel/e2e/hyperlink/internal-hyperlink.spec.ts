import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const link = (page: Page, coord: string) => cell(page, coord).locator('[data-cell-hyperlink]')
const editor = (page: Page) => page.getByRole('dialog', { name: /^(Insert|Edit) hyperlink$/ })

async function openEditor(page: Page) {
  await showRibbonItem(page, 'insert.hyperlink')
  await button(page, 'Hyperlink').click()
  await expect(editor(page)).toBeVisible()
}

test('LINK-013: Ctrl or Command click on internal hyperlink switches sheet and selects target range or defined name', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  // Define a named range on Summary first via Name box, then return to Sales Orders
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.fill('B3:C4')
  await nameBox.press('Enter')
  await nameBox.fill('TargetAmounts')
  await nameBox.press('Enter')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()

  // Insert cross-sheet range hyperlink on K2 and defined-name hyperlink on L2
  await select(page, 'K2', '1:10')
  await openEditor(page)
  await page.getByLabel('Link address').fill('#Summary!B5:D7')
  await page.getByLabel('Display text').fill('Go Summary Range')
  await button(page, 'Insert link').click()
  await expect(link(page, '1:10')).toHaveAttribute('href', '#Summary!B5:D7')

  await select(page, 'L2', '1:11')
  await openEditor(page)
  await page.getByLabel('Link address').fill('#TargetAmounts')
  await page.getByLabel('Display text').fill('Go Named Range')
  await button(page, 'Insert link').click()

  // Ctrl/Meta+click jumps in-workbook without opening any new browser page
  await cell(page, '1:10').click({ modifiers: ['ControlOrMeta'] })
  expect(context.pages()).toHaveLength(1)
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(nameBox).toHaveValue('B5:D7')

  // Return to Sales Orders and Ctrl/Meta+click the defined-name hyperlink
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await cell(page, '1:11').click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(nameBox).toHaveValue('TargetAmounts')
  await expect(cell(page, '0:0')).not.toHaveText('Go Summary Range')
})

test('LINK-014: hyperlink dialog opens internal location and reports hidden or missing targets without opening a new tab', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  await select(page, 'K2', '1:10')
  await openEditor(page)
  await page.getByLabel('Link address').fill('#NoSuchSheet!A1')
  await button(page, 'Open workbook location').click()
  await expect(editor(page).getByRole('alert')).toContainText('does not exist')
  expect(context.pages()).toHaveLength(1)

  await page.getByLabel('Link address').fill('#Summary!C3')
  await button(page, 'Insert link').click()

  // Hide Summary tab via context menu, then Ctrl/Meta+click K2 -> non-blocking notice
  await page.getByRole('tab', { name: 'Summary', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Hide', exact: true }).click()
  await cell(page, '1:10').click({ modifiers: ['ControlOrMeta'] })
  await expect(page.locator('[data-hyperlink-notice="true"]')).toContainText('hidden')
  await expect(page.getByRole('tab', { name: 'Sales Orders', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  // Unhide Summary and open internal location directly from the hyperlink dialog
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Unhide…', exact: true }).click()
  const unhideDialog = page.getByRole('dialog', { name: 'Unhide worksheet' })
  await unhideDialog.getByRole('option', { name: 'Summary', exact: true }).dblclick()
  await expect(unhideDialog).toHaveCount(0)

  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'K2', '1:10')
  await openEditor(page)
  await button(page, 'Open workbook location').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('C3')
})

test('LINK-015: renaming a worksheet retargets internal hyperlinks with single undo/redo and native file roundtrip', async ({
  page,
}) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')

  await select(page, 'K2', '1:10')
  await openEditor(page)
  await page.getByLabel('Link address').fill('#Summary!B5:D10')
  await page.getByLabel('Display text').fill('Summary Jump')
  await button(page, 'Insert link').click()
  await expect(link(page, '1:10')).toHaveAttribute('href', '#Summary!B5:D10')

  // Rename Summary -> 'Q4 Summary', then switch back to Sales Orders to inspect K2
  const summaryTab = page.getByRole('tab', { name: 'Summary', exact: true })
  await summaryTab.dblclick()
  const renameInput = page.getByRole('textbox', { name: 'Sheet name', exact: true })
  await renameInput.fill('Q4 Summary')
  await renameInput.press('Enter')

  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'K2', '1:10')
  await expect(link(page, '1:10')).toHaveAttribute('href', "#'Q4 Summary'!B5:D10")

  // Single Undo & Redo restores and reapplies the retargeted internal hyperlink
  await button(page, 'Undo').click()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(link(page, '1:10')).toHaveAttribute('href', '#Summary!B5:D10')
  await button(page, 'Redo').click()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(link(page, '1:10')).toHaveAttribute('href', "#'Q4 Summary'!B5:D10")

  // Native .einfach.json download & reopen roundtrip
  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const downloaded = await downloading
  const text = await readFile((await downloaded.path())!, 'utf8')
  const parsed = JSON.parse(text)
  expect(parsed.workbook.hyperlinks).toContainEqual({
    sheet: 0,
    row: 1,
    col: 10,
    url: "#'Q4 Summary'!B5:D10",
  })
  await button(page, 'Close').click()

  await select(page, 'K2', '1:10')
  await openEditor(page)
  await button(page, 'Remove link').click()
  await expect(link(page, '1:10')).toHaveCount(0)

  await button(page, 'File').click()
  page.once('dialog', (d) => d.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'InternalLinks.einfach.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(link(page, '1:10')).toHaveAttribute('href', "#'Q4 Summary'!B5:D10")
})
