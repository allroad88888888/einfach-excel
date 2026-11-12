import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  specialButton as button, specialCell as cell, specialFormula as formula,
  applySpecial, expectSpecialSettings, openSpecial, setSpecialInput as input, startSpecial,
} from '../support/special-number-format'

test.beforeEach(async ({ page }) => startSpecial(page))

test('typing into special formatted cells restores numeric zeros and preserves explicit text', async ({ page }) => {
  const neighbor = await cell(page, '40:4').innerText()
  await openSpecial(page, 'E40', '39:4')
  await applySpecial(page)
  await input(page, 'E40', '39:4', '00123')
  await expect(cell(page, '39:4')).toHaveText('00123')
  await expect(formula(page)).toHaveValue('123')
  await input(page, 'E40', '39:4', "'00123")
  await expect(cell(page, '39:4')).toHaveText('00123')
  await expect(formula(page)).toHaveValue("'00123")
  await input(page, 'E40', '39:4', '00123-4567')
  await expect(cell(page, '39:4')).toHaveText('00123-4567')
  await expect(formula(page)).toHaveValue('00123-4567')
  await input(page, 'E40', '39:4', "'001234567890123456789")
  await expect(cell(page, '39:4')).toHaveText('001234567890123456789')
  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText('00123-4567')
  await button(page, 'Redo').click()
  await expect(cell(page, '39:4')).toHaveText('001234567890123456789')
  await expectSpecialSettings(page, 'zip-code')
  await expect(cell(page, '40:4')).toHaveText(neighbor)
})

test('Special rounds display only and retains signs and digits beyond preset widths', async ({ page }) => {
  const neighbor = await cell(page, '40:4').innerText()
  for (const [preset, value, shown] of [
    ['zip-code', '-123.5', '-00124'], ['zip-plus-4', '1234567890123', '123456789-0123'],
    ['phone-us', '-2125551234', '-212555-1234'], ['phone-us', '5551234.5', '555-1235'],
    ['phone-us', '1234567890123', '(123456) 789-0123'], ['phone-us', '0', '-'],
  ]) {
    await input(page, 'E40', '39:4', value)
    await openSpecial(page, 'E40', '39:4', preset)
    await applySpecial(page)
    await expect(cell(page, '39:4')).toHaveText(shown)
    await expect(formula(page)).toHaveValue(value)
  }
  await expect(cell(page, '40:4')).toHaveText(neighbor)
})

test('Special decimal shortcuts do not replace the preset or add history', async ({ page }) => {
  await input(page, 'E40', '39:4', '=12345')
  await openSpecial(page, 'E40', '39:4', 'ssn-us')
  await applySpecial(page)
  await button(page, 'Increase decimal places').click()
  await button(page, 'Decrease decimal places').click()
  await expectSpecialSettings(page, 'ssn-us')
  await expect(cell(page, '39:4')).toHaveText('000-01-2345')
  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText('12345')
  await button(page, 'Redo').click()
  await expect(cell(page, '39:4')).toHaveText('000-01-2345')
  await select(page, 'E40', '39:4')
  await expect(formula(page)).toHaveValue('=12345')
})
