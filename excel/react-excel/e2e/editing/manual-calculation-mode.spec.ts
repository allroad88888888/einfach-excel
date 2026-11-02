import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const calculate = (page: Page) => page.getByRole('combobox', { name: 'Recalculate', exact: true })
const calculationMode = (page: Page) => page.getByRole('combobox', { name: 'Calculation mode', exact: true })

async function go(page: Page, reference: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(reference)
  await name.press('Enter')
  await expect(bar(page)).toBeEnabled()
}

async function write(page: Page, reference: string, value: string) {
  await go(page, reference)
  await bar(page).fill(value)
  await bar(page).press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('manual calculation mode keeps dependent formulas cached when inputs change until recalculate or automatic', async ({ page }) => {
  await expect(calculationMode(page)).toHaveValue('automatic')
  await write(page, 'B2', '10')
  await write(page, 'C2', '=B2*2')
  await expect(cell(page, '1:2')).toHaveText('20')

  await calculationMode(page).selectOption('manual')
  await expect(calculationMode(page)).toHaveValue('manual')
  await expect(page.getByRole('status').filter({ hasText: 'Calculation mode set to Manual.' })).toBeVisible()

  await write(page, 'B2', '25')
  await expect(cell(page, '1:1')).toHaveText('25')
  await expect(cell(page, '1:2')).toHaveText('20')

  await write(page, 'D2', '=B2+5')
  await expect(cell(page, '1:3')).toHaveText('30')
  await expect(cell(page, '1:2')).toHaveText('20')

  await calculate(page).selectOption('sheet')
  await expect(cell(page, '1:2')).toHaveText('50')

  await write(page, 'B2', '40')
  await expect(cell(page, '1:1')).toHaveText('40')
  await expect(cell(page, '1:2')).toHaveText('50')
  await expect(cell(page, '1:3')).toHaveText('30')

  await calculationMode(page).selectOption('automatic')
  await expect(calculationMode(page)).toHaveValue('automatic')
  await expect(page.getByRole('status').filter({ hasText: 'Calculation mode set to Automatic.' })).toBeVisible()
  await expect(cell(page, '1:2')).toHaveText('80')
  await expect(cell(page, '1:3')).toHaveText('45')
})

test('pressing F9 recalculates the workbook and Shift+F9 recalculates the current worksheet in manual mode', async ({ page }) => {
  await write(page, 'B2', '10')
  await write(page, 'C2', '=B2*2')
  await expect(cell(page, '1:2')).toHaveText('20')

  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('79')
  await write(page, 'D3', "='Sales Orders'!B2*3")
  await expect(cell(page, '2:3')).toHaveText('30')
  await write(page, 'D4', '5')
  await write(page, 'E4', '=D4*10')
  await expect(cell(page, '3:4')).toHaveText('50')

  await calculationMode(page).selectOption('manual')
  await expect(calculationMode(page)).toHaveValue('manual')

  await write(page, 'D4', '7')
  await expect(cell(page, '3:3')).toHaveText('7')
  await expect(cell(page, '3:4')).toHaveText('50')

  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await write(page, 'B2', '20')
  await expect(cell(page, '1:1')).toHaveText('20')
  await expect(cell(page, '1:2')).toHaveText('20')

  await cell(page, '1:1').click()
  await page.keyboard.press('Shift+F9')
  await expect(cell(page, '1:2')).toHaveText('40')

  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '3:4')).toHaveText('50')
  await expect(cell(page, '2:3')).toHaveText('30')

  await cell(page, '3:3').click()
  await page.keyboard.press('F9')
  await expect(cell(page, '3:4')).toHaveText('70')
  await expect(cell(page, '2:3')).toHaveText('60')
})
