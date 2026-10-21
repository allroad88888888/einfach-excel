import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { button, cell, panel, select, openProtection, protect, closeProtection, input, editor } from './support'

for (const width of [1280, 390])
  test(`native file roundtrip retains worksheet protection and editable ranges at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4'); await openProtection(page)
    await button(page, 'Allow editing in selection E2').click()
    await protect(page); await closeProtection(page)
    await button(page, 'File').click()
    const downloading = page.waitForEvent('download')
    await button(page, 'Download workbook').click()
    const file = await downloading
    const text = await readFile((await file.path())!, 'utf8')
    expect(JSON.parse(text).workbook.protection).toEqual([{ sheet: 0, protection: {
      mode: 'protected', unlockedRanges: [{ rowStart: 1, rowEnd: 1, colStart: 4, colEnd: 4 }],
    } }, { sheet: 1, protection: {
      mode: 'open', unlockedRanges: [{ rowStart: 70, rowEnd: 72, colStart: 0, colEnd: 0 }],
    } }])
    await button(page, 'Close').click()
    await openProtection(page); await button(page, 'Unprotect worksheet').click(); await closeProtection(page)
    await button(page, 'File').click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
      name: 'Protection.einfach.json', mimeType: 'application/json', buffer: Buffer.from(text),
    })
    await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
    await openProtection(page)
    await expect(button(page, 'Unprotect worksheet')).toBeEnabled()
    await expect(button(page, 'Remove editable range E2')).toBeDisabled()
    await closeProtection(page)
    await select(page, 'E2', '1:4'); await input(page, '2')
    await expect(cell(page, '1:4')).toHaveText('2')
    await select(page, 'F2', '1:5'); await input(page, '100')
    await expect(cell(page, '1:5')).toHaveText('79')
    await editor(page).press('Escape')
    await button(page, 'Undo').click()
    await expect(cell(page, '1:4')).toHaveText('1')
    await openProtection(page)
    await expect(panel(page)).toContainText('This worksheet is protected.')
  })
