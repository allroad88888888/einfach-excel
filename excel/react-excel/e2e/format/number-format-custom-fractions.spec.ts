import { expect, test } from '@playwright/test'
import {
  applyCustomFormat, customButton, customCell, customFormula, customPreview,
  openCustomFormat, setCustomInput, startCustomFormat,
} from '../support/custom-number-format'

test.beforeEach(async ({ page }) => {
  await startCustomFormat(page)
  await setCustomInput(page, 'neighbor', 'B1', '0:1')
})

test('custom fraction codes preserve scaling and mandatory denominator zeros', async ({ page }) => {
  for (const [value, pattern, expected] of [
    ['1.5', '# 00/00', '1 01/02'],
    ['0.125', '# ?/?%', '12 1/2%'],
    ['5250', '# ?/?,', '5 1/4'],
  ]) {
    await setCustomInput(page, value)
    await openCustomFormat(page, pattern)
    await expect(customPreview(page)).toHaveText(expected)
    await applyCustomFormat(page)
    await expect(customCell(page)).toHaveText(expected)
    await expect(customFormula(page)).toHaveValue(value)
    await expect(customCell(page, '0:1')).toHaveText('neighbor')
    await customButton(page, 'Undo').click()
    await expect(customCell(page)).toHaveText(value)
    await customButton(page, 'Redo').click()
    await expect(customCell(page)).toHaveText(expected)
    await customButton(page, 'Undo').click()
  }
})

test('quoted and escaped slashes remain literal in custom codes', async ({ page }) => {
  await setCustomInput(page, '12')
  for (const pattern of ['0"/"0', '0\\/0']) {
    await openCustomFormat(page, pattern)
    await expect(customPreview(page)).toHaveText('1/2')
    await applyCustomFormat(page)
    await expect(customCell(page)).toHaveText('1/2')
    await expect(customFormula(page)).toHaveValue('12')
    await expect(customCell(page, '0:1')).toHaveText('neighbor')
    await customButton(page, 'Undo').click()
    await expect(customCell(page)).toHaveText('12')
    await customButton(page, 'Redo').click()
    await expect(customCell(page)).toHaveText('1/2')
    await customButton(page, 'Undo').click()
  }
})
