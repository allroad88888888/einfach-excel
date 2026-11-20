import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { baselineCell as cell, baselineButton as button } from '../support/font-baseline'
import { expectShrinkFits, shrinkText, toggleShrink } from '../support/shrink-to-fit'
import { shrinkWorkbook } from '../support/shrink-workbook'

test('external XLSX shrink layers survive reexport and native reopen without the optional plugin', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(button(page, 'Shrink to fit')).toHaveCount(0)
  const bytes = await readFile(fileURLToPath(new URL('./shrink-external.xlsx', import.meta.url)))
  await openFile(page, bytes, 'xlsx')
  for (let pass = 0; pass < 3; pass++) {
    await expectShrinkFits(cell(page, '0:0'))
    await expect(shrinkText(cell(page, '1:0'))).toHaveCount(0)
    await expect(cell(page, '1:0')).toHaveCSS('font-size', '24px')
    await expect(shrinkText(cell(page, '0:1'))).toHaveCount(0)
    await expect(cell(page, '0:1')).toHaveCSS('white-space', 'pre-wrap')
    await expect(shrinkText(cell(page, '0:2'))).toHaveAttribute('data-shrink-scale', '1')
    await expect(cell(page, '2:1').locator('[data-font-baseline="subscript"]')).toHaveText('2')
    await select(page, 'E1', '0:4')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=D1*2')
    await expect(cell(page, '0:4')).toHaveText('25')
    const nativeBytes = await downloadFile(page), book = JSON.parse(nativeBytes.toString()).workbook
    expect(book.cells).toHaveLength(7)
    const formats = book.formats[0]
    expect(formats.columnStyles[0].format).toMatchObject({ shrinkToFit: true })
    expect(formats.rowStyles[0].format).toMatchObject({ shrinkToFit: true, wrap: true })
    expect(formats.cellStyles.find((style: { addr: string }) => style.addr === 'A2').format)
      .toMatchObject({ shrinkToFit: false, wrap: false, fontSize: 24 })
    expect(formats.cellStyles.find((style: { addr: string }) => style.addr === 'B1').format)
      .toMatchObject({ shrinkToFit: true, wrap: true })
    expect(book.richText[0].runs[1].format).toMatchObject({ fontBaseline: 'subscript', fontSize: 20 })
    if (pass === 0) await openFile(page, await downloadFile(page, true), 'xlsx')
    if (pass === 1) await openFile(page, nativeBytes)
  }
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('invalid native shrink flag keeps the current workbook and its undo history', async ({ page }) => {
  await page.goto('/?plugins=text-format')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, shrinkWorkbook)
  await select(page, 'A1', '0:0'); await toggleShrink(page)
  await expect(shrinkText(cell(page, '0:0'))).toHaveCount(0)
  await button(page, 'File').click()
  page.on('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Invalid.einfach.json', mimeType: 'application/json',
    buffer: Buffer.from(shrinkWorkbook.toString().replace('"shrinkToFit":true', '"shrinkToFit":"true"')),
  })
  const panel = page.getByRole('dialog', { name: 'Workbook files' })
  await expect(panel.getByRole('alert')).toContainText('Current workbook kept')
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(shrinkText(cell(page, '0:0'))).toHaveCount(0)
  await button(page, 'Undo').click()
  await expectShrinkFits(cell(page, '0:0'))
  await expect(button(page, 'Undo')).toBeDisabled()
})
