import { expect, test, type Page } from '@playwright/test'
import { openProtection, protect, closeProtection, button } from '../protection/support'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Fill series', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
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
  await select(page, address)
  await expect(editor(page)).toHaveValue(value)
}
async function open(page: Page, address: string, step = '2', stop = '') {
  await select(page, address)
  await button(page, 'Fill series').click()
  await dialog(page).getByLabel('Sequence type').selectOption('geometric')
  await expect(dialog(page).getByLabel('Source sample count')).toHaveCount(0)
  await expect(dialog(page).getByLabel('Step value')).toHaveValue('2')
  await dialog(page).getByLabel('Step value').fill(step)
  await dialog(page).getByLabel('Stop value (optional)').fill(stop)
}
async function apply(page: Page) {
  await dialog(page).getByRole('button', { name: 'Apply series', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'F40')
  await expect(cell(page, '39:5')).toHaveText('2')
})

test('geometric series multiplies the native start by a decimal step and stops without changing neighbors', async ({
  page,
}) => {
  await open(page, 'F40:F46', '1.5', '7')
  await apply(page)
  for (const [row, value] of [
    [39, '2'],
    [40, '3'],
    [41, '4.5'],
    [42, '6.75'],
    [43, '901'],
    [44, 'Integer 1–10'],
    [45, 'Decimal 0–1'],
  ] as const)
    await expect(cell(page, `${row}:5`)).toHaveText(value)
  await expect(cell(page, '42:5')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '43:5')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '42:4')).toHaveText('5')
  await select(page, 'F40')
  await expect(editor(page)).toHaveValue('2')
  await button(page, 'Undo').click()
  await expect(cell(page, '40:5')).toHaveText('')
  await expect(cell(page, '42:5')).toHaveText('')
  await expect(cell(page, '43:5')).toHaveText('901')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '42:5')).toHaveText('6.75')
  await expect(cell(page, '43:5')).toHaveText('901')
})

for (const [start, step, stop, expected] of [
  ['2', '-2', '', ['-4', '8', '-16']],
  ['2', '0', '', ['0', '0', '0']],
  ['2', '1', '', ['2', '2', '2']],
  ['-2', '2', '', ['-4', '-8', '-16']],
  ['0', '2', '', ['0', '0', '0']],
  ['8', '0.5', '1', ['4', '2', '1']],
  ['-8', '0.5', '-1', ['-4', '-2', '-1']],
] as const)
  test(`geometric native start ${start}, step ${step}, stop ${stop || 'blank'}`, async ({
    page,
  }) => {
    await write(page, 'A90', start)
    await open(page, 'A90:A93', step, stop)
    await apply(page)
    for (const [offset, value] of expected.entries())
      await expect(cell(page, `${90 + offset}:0`)).toHaveText(value)
    await expect(cell(page, '89:0')).toHaveText(start)
    await button(page, 'Undo').click()
    await expect(cell(page, '90:0')).toHaveText('')
  })

test('geometric rightward floating stop includes the mathematical boundary', async ({ page }) => {
  await write(page, 'A90', '0.1')
  await write(page, 'C90', '99')
  await open(page, 'A90:D90', '3', '0.3')
  await expect(dialog(page).getByLabel('Direction')).toHaveValue('right')
  await apply(page)
  await expect(cell(page, '89:1')).toHaveText('0.3')
  await expect(cell(page, '89:2')).toHaveText('99')
  await expect(cell(page, '89:3')).toHaveText('')
  await button(page, 'Undo').click()
  await expect(cell(page, '89:1')).toHaveText('')
  await expect(cell(page, '89:2')).toHaveText('99')
})

test('reached and wrong-direction stops create neither writes nor history', async ({ page }) => {
  for (const stop of ['2', '1']) {
    await open(page, 'F40:F46', '2', stop)
    await apply(page)
    await expect(cell(page, '40:5')).toHaveText('')
    await expect(cell(page, '43:5')).toHaveText('901')
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(button(page, 'Redo')).toBeDisabled()
  }
})

test('invalid stop combinations retain correctable drafts and overflow rejects atomically', async ({
  page,
}) => {
  await open(page, 'F40:F46', '0', '7')
  for (const step of ['-2', '0', '1']) {
    await dialog(page).getByLabel('Step value').fill(step)
    await dialog(page).getByRole('button', { name: 'Apply series' }).click()
    await expect(dialog(page).getByRole('alert')).toContainText('positive step other than 1')
    await expect(cell(page, '40:5')).toHaveText('')
    await expect(button(page, 'Undo')).toBeDisabled()
  }
  await dialog(page).getByLabel('Step value').fill('1e308')
  await dialog(page).getByLabel('Stop value (optional)').fill('')
  await dialog(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('non-finite')
  await expect(cell(page, '40:5')).toHaveText('')
  await expect(cell(page, '43:5')).toHaveText('901')
  await expect(button(page, 'Undo')).toBeDisabled()
  await dialog(page).getByLabel('Step value').fill('1.5')
  await dialog(page).getByLabel('Stop value (optional)').fill('7')
  await apply(page)
  await expect(cell(page, '42:5')).toHaveText('6.75')
})

test('zero native start with stop rejects until the optional stop is cleared', async ({ page }) => {
  await open(page, 'E40:E44', '2', '7')
  await dialog(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('non-zero start')
  await expect(cell(page, '40:4')).toHaveText('2')
  await expect(button(page, 'Undo')).toBeDisabled()
  await dialog(page).getByLabel('Stop value (optional)').fill('')
  await apply(page)
  await expect(cell(page, '40:4')).toHaveText('0')
  await button(page, 'Undo').click()
  await expect(cell(page, '40:4')).toHaveText('2')
})

test('stop excludes later spill and validation targets from native preflight', async ({ page }) => {
  await write(page, 'H43', '2')
  await open(page, 'H43:H47', '2', '4')
  await apply(page)
  await expect(cell(page, '43:7')).toHaveText('4')
  await expect(cell(page, '44:7')).toHaveText('5')
  await expect(cell(page, '45:7')).toHaveText('0.5')
  await expect(cell(page, '46:7')).toHaveText('Ready')
  await write(page, 'F54', '2')
  await open(page, 'F54:F59', '2', '8')
  await apply(page)
  await expect(cell(page, '54:5')).toHaveText('4')
  await expect(cell(page, '55:5')).toHaveText('8')
  await expect(cell(page, '56:5')).toHaveText('10')
  await expect(cell(page, '58:5')).toHaveText('30')
  await button(page, 'Undo').click()
  await expect(cell(page, '55:5')).toHaveText('Spill × 10')
  await expect(cell(page, '56:5')).toHaveText('10')
})

test('stop excludes locked later targets while actual geometric destinations remain protected', async ({
  page,
}) => {
  await select(page, 'F41:F43')
  await openProtection(page)
  await button(page, 'Allow editing in selection F41:F43').click()
  await protect(page)
  await closeProtection(page)
  await open(page, 'F40:F46', '1.5', '7')
  await apply(page)
  await expect(cell(page, '42:5')).toHaveText('6.75')
  await expect(cell(page, '43:5')).toHaveText('901')
  await button(page, 'Undo').click()
  await expect(cell(page, '42:5')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
  await open(page, 'F40:F46', '1.5')
  await dialog(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('protected')
  await expect(cell(page, '40:5')).toHaveText('')
})

for (const width of [1280, 390])
  test(`geometric fields and error remain usable at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.setViewportSize({ width, height: 800 })
    await open(page, 'F40:F46', '1.5', '7')
    for (const control of await dialog(page).locator('input, select, button').all())
      await expect(control).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`geometric-${width}.png`) })
    await dialog(page).getByLabel('Step value').fill('1')
    await dialog(page).getByRole('button', { name: 'Apply series' }).click()
    await expect(dialog(page).getByRole('alert')).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`geometric-error-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(button(page, 'Fill series')).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })

test('geometric fields, validation and native history label are translated into Chinese', async ({ page }) => {
  await page.goto('/?locale=zh')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: '名称框' })
  await name.fill('F40:F46'); await name.press('Enter')
  await page.getByRole('button', { name: '填充序列', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '填充序列', exact: true })
  await panel.getByLabel('序列类型').selectOption('geometric')
  await expect(panel.getByRole('option', { name: '等比序列' })).toHaveAttribute('value', 'geometric')
  await panel.getByLabel('步长值').fill('1')
  await panel.getByLabel('终止值（可选）').fill('7')
  await panel.getByRole('button', { name: '填充序列', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText('使用终止值时，起点须非零，步长须大于 0 且不为 1。')
  await panel.getByLabel('步长值').fill('1.5')
  await panel.getByRole('button', { name: '填充序列', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(cell(page, '42:5')).toHaveText('6.75')
  await page.getByRole('button', { name: '最近操作', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '最近操作', exact: true }))
    .toContainText('填充等比序列')
})
