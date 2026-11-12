import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const panel = (page: Page) => page.getByRole('dialog', { name: 'Fill series', exact: true })
const input = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
}
async function write(page: Page, address: string, value: string) {
  await select(page, address)
  await input(page).fill(value)
  await input(page).press('Enter')
}
async function raw(page: Page, addresses: string[]) {
  const values: string[] = []
  for (const address of addresses) {
    await select(page, address)
    values.push(await input(page).inputValue())
  }
  return values
}
async function fill(page: Page, address: string, step: string, stop: string) {
  await select(page, address)
  await showRibbonItem(page, 'data.fill-series')
  await button(page, 'Fill series').click()
  await panel(page).getByLabel('Sequence type').selectOption('geometric')
  await panel(page).getByLabel('Step value').fill(step)
  await panel(page).getByLabel('Stop value (optional)').fill(stop)
  await panel(page).getByRole('button', { name: 'Apply series', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

test('near-unit Stop keeps two distinct native terms and preserves the later sentinel', async ({
  page,
}) => {
  await fill(page, 'F40:F44', '1.00000000001', '2.00000000005')
  expect(await raw(page, ['F40', 'F41', 'F42', 'F43', 'F44'])).toEqual([
    '2',
    '2.00000000002',
    '2.00000000004',
    '',
    '901',
  ])
  await expect(cell(page, '43:5')).toHaveCSS('font-weight', '700')
  await button(page, 'Undo').click()
  expect(await raw(page, ['F40', 'F41', 'F42', 'F44'])).toEqual(['2', '', '', '901'])
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  expect(await raw(page, ['F41', 'F42', 'F44'])).toEqual(['2.00000000002', '2.00000000004', '901'])
})

test('distinct Stop overshoot keeps value and bold style without allocating fill history', async ({
  page,
}) => {
  await write(page, 'F43', '2')
  await fill(page, 'F43:F44', '2', '3.99999999995')
  expect(await raw(page, ['F43', 'F44'])).toEqual(['2', '901'])
  await expect(cell(page, '43:5')).toHaveCSS('font-weight', '700')
  await button(page, 'Undo').click()
  expect(await raw(page, ['F43', 'F44'])).toEqual(['', '901'])
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  expect(await raw(page, ['F43', 'F44'])).toEqual(['2', '901'])
})

test('Stop comparison preserves terms separated by one native f64 spacing', async ({ page }) => {
  await fill(page, 'F40:F44', '1.0000000000000002', '2.0000000000000013')
  expect(await raw(page, ['F40', 'F41', 'F42', 'F43', 'F44'])).toEqual([
    '2',
    '2.0000000000000004',
    '2.000000000000001',
    '2.0000000000000013',
    '901',
  ])
  await expect(cell(page, '43:5')).toHaveCSS('font-weight', '700')
})

test('small-magnitude rightward Stop retains its finite prefix and later value', async ({
  page,
}) => {
  await write(page, 'A90', '0.000000000001')
  await write(page, 'D90', '93')
  await fill(page, 'A90:D90', '2', '0.000000000005')
  expect((await raw(page, ['A90', 'B90', 'C90', 'D90'])).map(Number)).toEqual([
    1e-12, 2e-12, 4e-12, 93,
  ])
})
