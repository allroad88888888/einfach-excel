import { expect, test } from '@playwright/test'
import {
  specialButton as button, specialCell as cell, specialDialog as dialog, specialPreview as preview,
  applySpecial, expectSpecialSettings, openSpecial, setSpecialInput, startSpecial,
} from '../support/special-number-format'

test('changing the special locale resets the draft preset without writing until Apply', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await startSpecial(page)
  await setSpecialInput(page, 'E40', '39:4', '123')
  const neighbor = await cell(page, '40:4').innerText()
  await openSpecial(page, 'E40', '39:4', 'ssn-us')
  await page.getByLabel('Locale (location)', { exact: true }).selectOption('zh-CN')
  await expect(page.getByLabel('Special format type', { exact: true })).toHaveValue('postal-code-cn')
  await expect(page.getByLabel('Special format type').getByRole('option')).toHaveCount(1)
  await expect(preview(page)).toHaveText('000123')
  await expect(cell(page, '39:4')).toHaveText('123')
  await page.screenshot({ path: '../../.codex-artifacts/special-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: '../../.codex-artifacts/special-mobile.png' })
  await applySpecial(page)
  await expect(cell(page, '39:4')).toHaveText('000123')
  await expectSpecialSettings(page, 'postal-code-cn', 'zh-CN')
  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText('123')
  await button(page, 'Redo').click()
  await expect(cell(page, '39:4')).toHaveText('000123')
  await expect(cell(page, '40:4')).toHaveText(neighbor)
  expect(errors).toEqual([])
})
