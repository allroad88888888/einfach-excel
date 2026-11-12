import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  specialButton as button, specialCell as cell, specialFormula as formula,
  expectSpecialSettings, startSpecial,
} from '../support/special-number-format'

async function open(page: Page, bytes: Buffer) {
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({ name: 'Special.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
}

test('XLSX export and reopen recognizes all five special presets without changing values or text', async ({ page }) => {
  await startSpecial(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download as Excel (.xlsx)').click()
  const bytes = await readFile((await (await pending).path())!)
  await button(page, 'Close').click()
  await open(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  for (const [col, preset, value, shown] of [[0, 'zip-code', '123', '00123'],
    [1, 'zip-plus-4', '1234567', '00123-4567'], [2, 'phone-us', '2125551234', '(212) 555-1234'],
    [3, 'ssn-us', '12345678', '012-34-5678'], [4, 'postal-code-cn', '123', '000123']] as const) {
    await select(page, `${String.fromCharCode(65 + col)}23`, `22:${col}`)
    await expect(cell(page, `22:${col}`)).toHaveText(shown)
    await expect(formula(page)).toHaveValue(value)
    await expectSpecialSettings(page, preset, col === 4 ? 'zh-CN' : 'en-US')
  }
  await select(page, 'B96', '95:1')
  await expect(cell(page, '95:1')).toHaveText('00123')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('external Special codes with quoted punctuation and locales import their named settings', async ({ page }) => {
  await startSpecial(page)
  await open(page, await readFile(fileURLToPath(new URL('./special-formats.xlsx', import.meta.url))))
  for (const [col, preset, shown] of [[0, 'zip-code', '00123'], [1, 'zip-plus-4', '00123-4567'],
    [2, 'phone-us', '(212) 555-1234'], [3, 'ssn-us', '012-34-5678'], [4, 'postal-code-cn', '000123']] as const) {
    await select(page, `${String.fromCharCode(65 + col)}1`, `0:${col}`)
    await expect(cell(page, `0:${col}`)).toHaveText(shown)
    await expectSpecialSettings(page, preset, col === 4 ? 'zh-CN' : 'en-US')
    await expect(cell(page, `1:${col}`)).toHaveText('00123')
  }
  await expect(cell(page, '2:0')).toHaveText('-00124')
  await expect(cell(page, '2:1')).toHaveText('123456789-0123')
  await expect(cell(page, '2:2')).toHaveText('555-1235')
  await expect(cell(page, '2:3')).toHaveText('-012-34-5678')
  await expect(cell(page, '2:4')).toHaveText('000000')
  await expect(cell(page, '0:5')).toHaveText('Neighbor')
})
