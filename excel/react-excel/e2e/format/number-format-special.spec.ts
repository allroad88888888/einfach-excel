import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  specialButton as button, specialCell as cell, specialFormula as formula,
  specialPreview as preview, applySpecial, expectSpecialSettings, openSpecial,
  setSpecialInput as input, startSpecial,
} from '../support/special-number-format'

test.beforeEach(async ({ page }) => startSpecial(page))

for (const [preset, locale, value, result, title] of [
  ['zip-code', 'en-US', '=123', '00123', 'US ZIP settings display five digits without changing the value or neighboring cells'],
  ['zip-plus-4', 'en-US', '=1234567', '00123-4567', 'US ZIP plus 4 settings restore leading zeros and undo the format once'],
  ['postal-code-cn', 'zh-CN', '=123', '000123', 'Chinese postal settings display six digits and reopen with the same preset'],
] as const) test(title, async ({ page }) => {
  await input(page, 'E40', '39:4', value)
  const neighbor = await cell(page, '40:4').innerText()
  await openSpecial(page, 'E40', '39:4', preset, locale)
  await expect(preview(page)).toHaveText(result)
  await expect(cell(page, '39:4')).not.toHaveText(result)
  await applySpecial(page)
  await expect(cell(page, '39:4')).toHaveText(result)
  await expect(formula(page)).toHaveValue(value)
  await expectSpecialSettings(page, preset, locale)
  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText(value.slice(1))
  await button(page, 'Redo').click()
  await expect(cell(page, '39:4')).toHaveText(result)
  await expect(cell(page, '40:4')).toHaveText(neighbor)
})

test('US phone settings display seven and ten digit numbers without truncating the value', async ({ page }) => {
  await input(page, 'E40', '39:4', '5551234')
  await input(page, 'E41', '40:4', '2125551234')
  const neighbor = await cell(page, '41:4').innerText()
  await openSpecial(page, 'E40:E41', '39:4', 'phone-us')
  await expect(preview(page)).toHaveText('(212) 555-1234')
  await applySpecial(page)
  await expect(cell(page, '39:4')).toHaveText('555-1234')
  await expect(cell(page, '40:4')).toHaveText('(212) 555-1234')
  await select(page, 'E40', '39:4')
  await expect(formula(page)).toHaveValue('5551234')
  await expectSpecialSettings(page, 'phone-us')
  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText('5551234')
  await expect(cell(page, '40:4')).toHaveText('2125551234')
  await button(page, 'Redo').click()
  await expect(cell(page, '40:4')).toHaveText('(212) 555-1234')
  await expect(cell(page, '41:4')).toHaveText(neighbor)
})

test('US SSN settings display nine digits without converting formulas or text', async ({ page }) => {
  await input(page, 'E40', '39:4', '=12345678')
  await input(page, 'E41', '40:4', "'001234567")
  const neighbor = await cell(page, '41:4').innerText()
  await openSpecial(page, 'E40:E41', '39:4', 'ssn-us')
  await expect(preview(page)).toHaveText('001234567')
  await applySpecial(page)
  await expect(cell(page, '39:4')).toHaveText('012-34-5678')
  await expect(cell(page, '40:4')).toHaveText('001234567')
  await select(page, 'E40', '39:4')
  await expect(formula(page)).toHaveValue('=12345678')
  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText('12345678')
  await button(page, 'Redo').click()
  await expect(cell(page, '39:4')).toHaveText('012-34-5678')
  await expect(cell(page, '40:4')).toHaveText('001234567')
  await expect(cell(page, '41:4')).toHaveText(neighbor)
})

test('Special demo samples reopen as named presets after real Rust import', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  for (const [letter, col, preset, value, shown] of [
    ['A', 0, 'zip-code', '123', '00123'], ['B', 1, 'zip-plus-4', '1234567', '00123-4567'],
    ['C', 2, 'phone-us', '2125551234', '(212) 555-1234'],
    ['D', 3, 'ssn-us', '12345678', '012-34-5678'], ['E', 4, 'postal-code-cn', '123', '000123'],
  ] as const) {
    await select(page, `${letter}23`, `22:${col}`)
    await expect(cell(page, `22:${col}`)).toHaveText(shown)
    await expect(formula(page)).toHaveValue(value)
    await expectSpecialSettings(page, preset, col === 4 ? 'zh-CN' : 'en-US')
  }
})
