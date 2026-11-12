import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const panel = (page: Page) => page.getByRole('dialog', { name: 'Fill series', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
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
  await editor(page).fill(value)
  await editor(page).press('Enter')
}
async function raw(page: Page, addresses: string[]) {
  const values: string[] = []
  for (const address of addresses) {
    await select(page, address)
    values.push(await editor(page).inputValue())
  }
  return values
}
async function open(page: Page, range: string, kind: 'date-weekday' | 'date-year', step = '1') {
  await select(page, range)
  await showRibbonItem(page, 'data.fill-series')
  await button(page, 'Fill series').click()
  await panel(page).getByLabel('Sequence type').selectOption(kind)
  await expect(panel(page).getByLabel('Step value')).toHaveValue('1')
  await expect(panel(page).getByLabel('Source sample count')).toHaveCount(0)
  await expect(panel(page).getByLabel('Stop value (optional)')).toHaveCount(0)
  await panel(page).getByLabel('Step value').fill(step)
}
async function apply(page: Page) {
  await panel(page).getByRole('button', { name: 'Apply series', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

test('weekday date series skips weekends and preserves time and formatting with one undo', async ({
  page,
}) => {
  await open(page, 'F20:F23', 'date-weekday')
  await apply(page)
  for (const [row, date] of [
    [19, '2024-03-01'],
    [20, '2024-03-04'],
    [21, '2024-03-05'],
    [22, '2024-03-06'],
  ] as const)
    await expect(cell(page, `${row}:5`)).toHaveText(`${date} 12:00`)
  await expect(cell(page, '22:5')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '23:5')).toHaveText('901')
  await expect(cell(page, '23:5')).toHaveCSS('font-weight', '700')
  expect(await raw(page, ['F20', 'F23', 'H20'])).toEqual(['45352.5', '45357.5', '45351.25'])
  await button(page, 'Undo').click()
  expect(await raw(page, ['F20', 'F21', 'F23', 'F24'])).toEqual(['45352.5', '', '', '901'])
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '22:5')).toHaveText('2024-03-06 12:00')
})

test('yearly date series clamps leap day and restores it in a later leap year with one undo', async ({
  page,
}) => {
  await open(page, 'H20:H24', 'date-year')
  await apply(page)
  for (const [row, date] of [
    [19, '2024-02-29'],
    [20, '2025-02-28'],
    [21, '2026-02-28'],
    [22, '2027-02-28'],
    [23, '2028-02-29'],
  ] as const)
    await expect(cell(page, `${row}:7`)).toHaveText(`${date} 06:00`)
  await expect(cell(page, '23:7')).toHaveCSS('text-decoration-line', 'underline')
  await expect(cell(page, '24:7')).toHaveText('902')
  await expect(cell(page, '24:7')).toHaveCSS('font-weight', '700')
  expect(await raw(page, ['H20', 'H24', 'F20'])).toEqual(['45351.25', '46812.25', '45352.5'])
  await button(page, 'Undo').click()
  expect(await raw(page, ['H20', 'H21', 'H24', 'H25'])).toEqual(['45351.25', '', '', '902'])
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '23:7')).toHaveText('2028-02-29 06:00')
})

for (const [start, step, expected] of [
  ['2024-03-02', '2', [45353, 45356, 45358, 45362]],
  ['2024-03-03', '-1', [45354, 45352, 45351, 45350]],
  ['2024-03-04', '-2', [45355, 45351, 45349, 45345]],
] as const)
  test(`weekday rightward ${start} with step ${step} counts only weekdays`, async ({ page }) => {
    await write(page, 'A90', start)
    await open(page, 'A90:D90', 'date-weekday', step)
    await expect(panel(page).getByLabel('Direction')).toHaveValue('right')
    await apply(page)
    expect((await raw(page, ['A90', 'B90', 'C90', 'D90'])).map(Number)).toEqual(expected)
  })

for (const [start, step, expected] of [
  ['2023-02-28', '1', ['2024-02-28', '2025-02-28']],
  ['2024-02-29', '-2', ['2022-02-28', '2020-02-29']],
] as const)
  test(`yearly rightward ${start} with step ${step} retains the original month and day`, async ({
    page,
  }) => {
    await write(page, 'A90', start)
    await open(page, 'A90:C90', 'date-year', step)
    await apply(page)
    await expect(cell(page, '89:1')).toHaveText(expected[0])
    await expect(cell(page, '89:2')).toHaveText(expected[1])
    await expect(cell(page, '89:0')).toHaveText(start)
  })

for (const [start, expected] of [
  ['0.5', ['366.5', '731.5']],
  ['60.5', ['425.5', '790.5']],
] as const)
  test(`yearly serial ${start} follows the explicit 1900 boundary while keeping noon`, async ({
    page,
  }) => {
    await write(page, 'F20', start)
    await open(page, 'F20:F22', 'date-year')
    await apply(page)
    expect(await raw(page, ['F20', 'F21', 'F22'])).toEqual([start, ...expected])
    await expect(cell(page, '21:5')).toContainText('12:00')
  })

for (const kind of ['date-weekday', 'date-year'] as const)
  test(`${kind} rejects huge safe steps quickly and keeps the draft correctable`, async ({
    page,
  }) => {
    await open(page, 'F20:F22', kind, '9007199254740991')
    await panel(page).getByRole('button', { name: 'Apply series' }).click()
    await expect(panel(page).getByRole('alert')).toContainText('outside the supported range')
    await expect(cell(page, '20:5')).toHaveText('')
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(panel(page).getByLabel('Step value')).toHaveValue('9007199254740991')
    await panel(page).getByLabel('Step value').fill('1')
    await apply(page)
    await expect(cell(page, '20:5')).not.toHaveText('')
  })

test('yearly late overflow preserves the whole destination and can retry with a negative step', async ({
  page,
}) => {
  await write(page, 'F20', '9998-12-31')
  await write(page, 'F21', '901')
  await open(page, 'F20:F22', 'date-year')
  await panel(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(panel(page).getByRole('alert')).toContainText('outside the supported range')
  await expect(cell(page, '20:5')).toHaveText('901')
  await expect(cell(page, '21:5')).toHaveText('')
  await panel(page).getByLabel('Step value').fill('-1')
  await apply(page)
  await expect(cell(page, '20:5')).toHaveText('9997-12-31')
  await expect(cell(page, '21:5')).toHaveText('9996-12-31')
  await button(page, 'Undo').click()
  expect(await raw(page, ['F21', 'F22'])).toEqual(['901', ''])
})

test('formula source and matrix geometry reject without writing calendar targets', async ({
  page,
}) => {
  await open(page, 'F20:H23', 'date-weekday')
  await panel(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(panel(page).getByRole('alert')).toContainText('one row or column')
  await panel(page).getByRole('button', { name: 'Cancel' }).click()
  await write(page, 'F20', '=45352.5')
  await open(page, 'F20:F23', 'date-year')
  await panel(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(panel(page).getByRole('alert')).toContainText('non-formula numbers')
  await expect(cell(page, '20:5')).toHaveText('')
})

for (const width of [1280, 390])
  for (const kind of ['date-weekday', 'date-year'] as const)
    test(`${kind} step validation, focus and controls fit ${width}px`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.setViewportSize({ width, height: 800 })
      await open(page, 'F20:F23', kind)
      for (const control of await panel(page).locator('input, select, button').all())
        await expect(control).toBeInViewport()
      await page.screenshot({ path: info.outputPath(`${kind}-${width}.png`) })
      await panel(page).getByLabel('Step value').fill('0.5')
      await panel(page).getByRole('button', { name: 'Apply series' }).click()
      await expect(panel(page).getByRole('alert')).toContainText('non-zero safe whole-number')
      await expect(button(page, 'Undo')).toBeDisabled()
      await page.screenshot({ path: info.outputPath(`${kind}-error-${width}.png`) })
      await page.keyboard.press('Escape')
      await expect(button(page, 'Fill series')).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(errors).toEqual([])
    })

test('calendar options, step correction and native history labels are translated', async ({
  page,
}) => {
  await page.goto('/?locale=zh')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: '名称框' })
  for (const [kind, label] of [
    ['date-weekday', '工作日日期序列'],
    ['date-year', '按年日期序列'],
  ] as const) {
    await name.fill(kind === 'date-weekday' ? 'F20:F23' : 'H20:H24')
    await name.press('Enter')
    await showRibbonItem(page, 'data.fill-series')
    await page.getByRole('button', { name: '填充序列', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '填充序列', exact: true })
    await dialog.getByLabel('序列类型').selectOption(kind)
    await expect(dialog.getByRole('option', { name: label, exact: true })).toHaveAttribute(
      'value',
      kind,
    )
    await dialog.getByLabel('步长值').fill('0')
    await dialog.getByRole('button', { name: '填充序列', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('请输入非零安全整数步长。')
    await dialog.getByLabel('步长值').fill('1')
    await dialog.getByRole('button', { name: '填充序列', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  await showRibbonItem(page, 'history.recent-operations')
  await page.getByRole('button', { name: '最近操作', exact: true }).click()
  const history = page.getByRole('dialog', { name: '最近操作', exact: true })
  await expect(history).toContainText('填充工作日日期序列')
  await expect(history).toContainText('填充按年日期序列')
})
