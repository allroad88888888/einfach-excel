import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { closeProtection, openProtection, protect } from '../protection/support'
import { select } from '../support/clipboard'
import { showRibbonControl, showRibbonItem } from '../support/ribbon'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function openStyles(page: Page) {
  await showRibbonItem(page, 'format.cell-styles')
  await button(page, 'Cell styles and themes').click()
  const dialog = page.getByRole('dialog', { name: 'Cell styles and themes', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('CELLSTYLE-001: built-in cell style presets apply fill, font, and borders atomically with single undo and Normal reset', async ({
  page,
}) => {
  const b3 = await select(page, 'B3', '2:1')
  const originalBg = await b3.evaluate((node) => getComputedStyle(node).backgroundColor)
  const originalFg = await b3.evaluate((node) => getComputedStyle(node).color)

  const dialog = await openStyles(page)
  await dialog.locator('[data-style-preset="good"]').click()
  await expect(dialog).toHaveCount(0)
  await expect(b3).toHaveCSS('background-color', 'rgb(198, 239, 206)')
  await expect(b3).toHaveCSS('color', 'rgb(0, 97, 0)')
  await expect(b3).toHaveText('Northwind')

  const c3 = await select(page, 'C3', '2:2')
  const originalWeight = await c3.evaluate((node) => getComputedStyle(node).fontWeight)
  const originalBorderBottom = await c3.evaluate((node) => getComputedStyle(node).borderBottomColor)

  const totalDialog = await openStyles(page)
  await totalDialog.locator('[data-style-preset="total"]').click()
  await expect(totalDialog).toHaveCount(0)
  await expect(c3).toHaveCSS('font-weight', '700')
  await expect(c3).toHaveCSS('border-bottom-color', 'rgb(68, 114, 196)')
  await expect(c3).toHaveCSS('border-bottom-style', 'double')

  // Single undo reverts bold and borders together
  await button(page, 'Undo').click()
  await expect(c3).toHaveCSS('font-weight', originalWeight)
  await expect(c3).toHaveCSS('border-bottom-color', originalBorderBottom)

  await button(page, 'Redo').click()
  await expect(c3).toHaveCSS('font-weight', '700')
  await expect(c3).toHaveCSS('border-bottom-color', 'rgb(68, 114, 196)')

  // Applying Normal resets Good styling in one step
  await select(page, 'B3', '2:1')
  const resetDialog = await openStyles(page)
  await resetDialog.locator('[data-style-preset="normal"]').click()
  await expect(resetDialog).toHaveCount(0)
  await expect(b3).toHaveCSS('background-color', originalBg)
  await expect(b3).toHaveCSS('color', originalFg)

  await button(page, 'Undo').click()
  await expect(b3).toHaveCSS('background-color', 'rgb(198, 239, 206)')
  await expect(b3).toHaveCSS('color', 'rgb(0, 97, 0)')
})

test('CELLSTYLE-002: switching workbook theme updates themed cell styles and Fill color palette theme row', async ({
  page,
}) => {
  await select(page, 'C4', '3:2')
  const dialog = await openStyles(page)
  await expect(dialog.getByRole('radio', { name: 'Office', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(dialog.locator('[data-style-preset="accent-1"]')).toHaveCSS(
    'background-color',
    'rgb(68, 114, 196)',
  )

  const facetRadio = dialog.getByRole('radio', { name: 'Facet', exact: true })
  await facetRadio.click()
  await expect(facetRadio).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.locator('[data-style-preset="accent-1"]')).toHaveCSS(
    'background-color',
    'rgb(144, 194, 38)',
  )

  await dialog.locator('[data-style-preset="accent-1"]').click()
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '3:2')).toHaveCSS('background-color', 'rgb(144, 194, 38)')
  await expect(cell(page, '3:2')).toHaveCSS('color', 'rgb(255, 255, 255)')

  // Fill color palette reflects the active Facet theme colors
  await select(page, 'C5', '4:2')
  await showRibbonControl(page, 'Choose fill color')
  await button(page, 'Choose fill color').click()
  const palette = page.getByRole('dialog')
  await expect(palette).toBeVisible()
  const themeGroup = palette.getByRole('group', { name: 'Theme colors', exact: true })
  await expect(themeGroup.getByRole('button', { name: 'Theme color #90c226', exact: true })).toBeVisible()
  await themeGroup.getByRole('button', { name: 'Theme color #e76618', exact: true }).click()
  await expect(palette).toHaveCount(0)
  await expect(cell(page, '4:2')).toHaveCSS('background-color', 'rgb(231, 102, 24)')
})

test('CELLSTYLE-003: cell styles respect worksheet protection and survive native workbook roundtrip', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  await openProtection(page)
  await button(page, 'Allow editing in selection B3').click()
  await expect(button(page, 'Remove editable range B3')).toBeVisible()
  await protect(page)
  await closeProtection(page)

  // Locked cell A3 rejects cell style and surfaces an alert inside the dialog
  const a3 = await select(page, 'A3', '2:0')
  const a3BeforeBg = await a3.evaluate((node) => getComputedStyle(node).backgroundColor)
  const lockedDialog = await openStyles(page)
  await lockedDialog.locator('[data-style-preset="bad"]').click()
  await expect(lockedDialog.getByRole('alert')).toContainText('Could not apply cell style')
  await expect(a3).toHaveCSS('background-color', a3BeforeBg)
  await lockedDialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(lockedDialog).toHaveCount(0)

  // Unlocked cell B3 accepts Bad preset
  await select(page, 'B3', '2:1')
  const unlockedDialog = await openStyles(page)
  await unlockedDialog.locator('[data-style-preset="bad"]').click()
  await expect(unlockedDialog).toHaveCount(0)
  await expect(cell(page, '2:1')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  await expect(cell(page, '2:1')).toHaveCSS('color', 'rgb(156, 0, 6)')

  // Native workbook download and reopen preserve applied style
  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const file = await downloading
  const text = await readFile((await file.path())!, 'utf8')
  await button(page, 'Close').click()

  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'File').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'CellStylesRoundtrip.einfach.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await expect(cell(page, '2:1')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  await expect(cell(page, '2:1')).toHaveCSS('color', 'rgb(156, 0, 6)')
})
