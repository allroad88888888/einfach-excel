import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}
async function write(page: Page, address: string, formula: string) {
  await select(page, address)
  const editor = page.getByRole('textbox', { name: 'Active cell value' })
  await editor.fill(formula)
  await editor.press('Enter')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

test('real formula editing uses 1900 serials, recalculates date parts and restores them on undo', async ({ page }) => {
  await write(page, 'A80', '=DATE(1970,1,1)')
  await expect(cell(page, '79:0')).toHaveText('25569')
  await write(page, 'B80', '=YEAR(A80)')
  await expect(cell(page, '79:1')).toHaveText('1970')
  await write(page, 'A80', '=DATE(2024,1,1)')
  await expect(cell(page, '79:0')).toHaveText('45292')
  await expect(cell(page, '79:1')).toHaveText('2024')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '79:0')).toHaveText('25569')
  await expect(cell(page, '79:1')).toHaveText('1970')
  await select(page, 'A80')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=DATE(1970,1,1)')
})

test('the compatibility leap day remains numeric and agrees with date parts and weekday', async ({ page }) => {
  for (const [address, formula] of [
    ['A80', '=DATEVALUE("1900-02-28")'], ['A81', '=A80+1'],
    ['B81', '=DAY(A81)'], ['C81', '=MONTH(A81)'], ['D81', '=WEEKDAY(A81)'],
    ['A82', '=A81+1'], ['B82', '=DAY(A82)'], ['C82', '=MONTH(A82)'],
  ]) await write(page, address!, formula!)
  for (const [coord, text] of [
    ['79:0', '59'], ['80:0', '60'], ['80:1', '29'], ['80:2', '2'],
    ['80:3', '4'], ['81:0', '61'], ['81:1', '1'], ['81:2', '3'],
  ]) await expect(cell(page, coord!)).toHaveText(text!)
})

test('workday and month calculations use the same epoch while invalid dates show native errors', async ({ page }) => {
  for (const [address, formula, expected] of [
    ['A80', '=DATE(2024,1,1)', '45292'],
    ['B80', '=WORKDAY(A80,5)', '45299'],
    ['C80', '=EOMONTH(A80,1)', '45351'],
    ['D80', '=NETWORKDAYS(A80,B80)', '6'],
    ['E80', '=DATEVALUE("2023-02-29")', '#VALUE!'],
    ['F80', '=YEAR(1e99)', '#NUM!'],
  ]) {
    await write(page, address!, formula!)
    await select(page, address!)
    await expect(cell(page, `79:${address!.charCodeAt(0) - 65}`)).toHaveText(expected!)
  }
})
