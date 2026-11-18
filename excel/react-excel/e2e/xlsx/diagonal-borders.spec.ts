import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { diagonalCell as cell, diagonalButton as button, diagonalLines,
  diagonalWorkbook, openDiagonal, applyDiagonal } from '../support/diagonal-borders'

test('external diagonal XLSX survives Excel and native reopening without the optional editor', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  const bytes = await readFile(fileURLToPath(new URL('./diagonal-external.xlsx', import.meta.url)))
  await openFile(page, bytes, 'xlsx')
  for (let pass = 0; pass < 3; pass++) {
    await expect(cell(page, '0:0').locator('[data-diagonal="diagDown"]')).toHaveAttribute('stroke', '#c00000')
    await expect(cell(page, '0:1').locator('[data-diagonal="diagUp"]')).toHaveAttribute('stroke', '#0000ff')
    await expect(diagonalLines(cell(page, '0:2'))).toHaveCount(4)
    await expect(cell(page, '0:6').locator('[data-diagonal="diagDown"]')).toHaveAttribute('stroke', '#ff00ff')
    await expect(cell(page, '0:6')).not.toHaveCSS('border-bottom-color', 'rgb(255, 0, 255)')
    for (const coord of ['0:3', '0:4', '0:5']) await expect(diagonalLines(cell(page, coord))).toHaveCount(0)
    await expect(page.locator('[data-merged-cell][data-cell="2:0"] [data-diagonal]')).toHaveCount(4)
    await select(page, 'D3', '2:3')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=12*2')
    const nativeBytes = await downloadFile(page)
    const native = JSON.parse(nativeBytes.toString()).workbook
    const formats = native.formats.flatMap((range: { cellStyles: unknown[] }) => range.cellStyles)
    const both = formats.find((entry: { addr: string }) => entry.addr === 'C1').format.borders
    expect(both.diagDown).toEqual(both.diagUp)
    if (pass === 0) await openFile(page, await downloadFile(page, true), 'xlsx')
    if (pass === 1) await openFile(page, nativeBytes)
  }
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('invalid native diagonal pairs preserve the open workbook and its undo history', async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, diagonalWorkbook)
  await select(page, 'B2', '1:1'); await openDiagonal(page, 'diagonal'); await applyDiagonal(page)
  const native = JSON.parse((await downloadFile(page)).toString())
  const style = native.workbook.formats[0].cellStyles.find((entry: { addr: string }) => entry.addr === 'B2')
  style.format.borders.diagUp.color = '#0000ff'
  await button(page, 'File').click(); page.on('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Invalid.einfach.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(native)),
  })
  const panel = page.getByRole('dialog', { name: 'Workbook files' })
  await expect(panel.getByRole('alert')).toContainText('Current workbook kept')
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(2)
  await button(page, 'Undo').click(); await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
