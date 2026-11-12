import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  specialButton as button, specialCell as cell, expectSpecialSettings, startSpecial,
} from '../support/special-number-format'

test('native save and reopen restores all special presets and their locales', async ({ page }) => {
  await startSpecial(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'E23', '22:4')
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const bytes = await readFile((await (await pending).path())!)
  await button(page, 'Close').click()
  await button(page, 'General format').click()
  await expect(cell(page, '22:4')).toHaveText('123')
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Special.einfach.json', mimeType: 'application/json', buffer: bytes,
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  for (const [col, preset, shown] of [[0, 'zip-code', '00123'], [1, 'zip-plus-4', '00123-4567'],
    [2, 'phone-us', '(212) 555-1234'], [3, 'ssn-us', '012-34-5678'], [4, 'postal-code-cn', '000123']] as const) {
    await select(page, `${String.fromCharCode(65 + col)}23`, `22:${col}`)
    await expect(cell(page, `22:${col}`)).toHaveText(shown)
    await expectSpecialSettings(page, preset, col === 4 ? 'zh-CN' : 'en-US')
  }
  await expect(cell(page, '23:0')).toBeEmpty()
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('invalid native special preset or locale is rejected without replacing the workbook', async ({ page }) => {
  await startSpecial(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const saved = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  await button(page, 'Close').click()
  for (const format of [{ kind: 'special', preset: 'unknown', locale: 'en-US' },
    { kind: 'special', preset: 'zip-code', locale: 'en-GB' },
    { kind: 'special', preset: 'zip-code', locale: 'zh-CN' }]) {
    const book = structuredClone(saved)
    book.workbook.formats[0].cellStyles[0].format.numberFormat = format
    await button(page, 'File').click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
      name: 'Invalid.einfach.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(book)),
    })
    await expect(page.getByRole('dialog', { name: 'Workbook files' }).getByRole('alert')).toBeVisible()
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await button(page, 'Close').click()
  }
})
