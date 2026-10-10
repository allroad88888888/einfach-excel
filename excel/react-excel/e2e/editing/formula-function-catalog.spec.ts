import { expect, test } from '@playwright/test'
import { FORMULA_FUNCTION_SPECS } from '../../../spreadsheet-ui-core/src/formula-functions/registry'
import { select } from '../support/clipboard'

/** 候选目录的每一项都必须经真实 Worker/WASM 算出结果，不能只检查函数名存在。 */
const examples: Record<string, [string, string]> = {
  SUM: ['SUM(E2:E3)', '3'],
  AVERAGE: ['AVERAGE(E2:E3)', '1.5'],
  COUNT: ['COUNT(E2:E3)', '2'],
  MIN: ['MIN(E2:E3)', '1'],
  MAX: ['MAX(E2:E3)', '2'],
  IF: ['IF(E2=1,3,4)', '3'],
  SUMIF: ['SUMIF(E2:E3,">1")', '2'],
  COUNTIF: ['COUNTIF(E2:E3,">1")', '1'],
  ABS: ['ABS(-3)', '3'],
  ROUND: ['ROUND(1.234,2)', '1.23'],
  CONCAT: ['CONCAT("a","b")', 'ab'],
  AND: ['AND(TRUE,TRUE)', 'TRUE'],
  OR: ['OR(FALSE,TRUE)', 'TRUE'],
  NOT: ['NOT(FALSE)', 'TRUE'],
  LEN: ['LEN("abc")', '3'],
  LOWER: ['LOWER("ABC")', 'abc'],
  UPPER: ['UPPER("abc")', 'ABC'],
  TRIM: ['TRIM(" a  b ")', 'a b'],
  SQRT: ['SQRT(9)', '3'],
  MOD: ['MOD(7,3)', '1'],
  VLOOKUP: ['VLOOKUP(2,E2:E3,1,FALSE)', '2'],
}

test('every suggested function calculates through the real Rust worker', async ({ page }) => {
  await page.goto('/')
  const target = await select(page, 'B2', '1:1')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  expect(Object.keys(examples).sort()).toEqual(FORMULA_FUNCTION_SPECS.map(({ name }) => name).sort())
  for (const { name } of FORMULA_FUNCTION_SPECS) {
    await test.step(name, async () => {
      const [formula, expected] = examples[name]
      await input.fill(`=${formula}`)
      await input.press('Enter')
      await expect(target).toHaveText(expected)
      await expect(input).toBeEnabled()
      await expect(input).toHaveValue(`=${formula}`)
    })
  }
})

test('TRIM preserves non-ASCII whitespace and participates in native undo/redo', async ({ page }) => {
  await page.goto('/')
  const target = await select(page, 'B2', '1:1')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  const formula = '=TRIM(" \u00a0a\u00a0  b ")'
  await input.fill(formula)
  await input.press('Enter')
  // toHaveText 默认会规范空白；这里用原始 DOM 文本保住 NBSP 的断言。
  await expect.poll(() => target.textContent()).toBe('\u00a0a\u00a0 b')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target).toHaveText('Acme Co.')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(() => target.textContent()).toBe('\u00a0a\u00a0 b')
  await expect(input).toHaveValue(formula)
})
