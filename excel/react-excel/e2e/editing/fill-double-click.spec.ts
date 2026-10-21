import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const name = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
const handle = (page: Page) => page.getByRole('button', { name: 'Drag to fill', exact: true })
async function write(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill(value)
  await input.press('Enter')
  await expect(input).toBeEnabled()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

for (const width of [1280, 390]) {
  test(`double-click fills formulas to adjacent data once at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    await select(page, 'B71', '70:1')
    await handle(page).dblclick()
    await expect(name(page)).toHaveValue('B71:B73')
    await expect(page.getByLabel('Fill status')).toHaveText('Filled down.')
    await expect(cell(page, '71:1')).toHaveText('5')
    await expect(cell(page, '72:1')).toHaveText('6')
    await expect(cell(page, '72:1')).toHaveCSS('font-weight', '700')
    await expect(cell(page, '73:1')).toHaveText('')
    await select(page, 'B71:B73', '70:1')
    await page.screenshot({ path: info.outputPath(`double-fill-${width}.png`) })
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '72:1')).toHaveText('')
    await expect(cell(page, '70:1')).toHaveText('4')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '72:1')).toHaveText('6')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('no adjacent continuation does not write and another source can fill afterwards', async ({ page }) => {
  await select(page, 'D71', '70:3')
  await handle(page).dblclick()
  await expect(page.getByLabel('Fill status')).toHaveText('No adjacent continuous data to fill.')
  await expect(name(page)).toHaveValue('D71')
  await expect(cell(page, '70:3')).toHaveText('Fill me')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await select(page, 'B71', '70:1')
  await handle(page).dblclick()
  await expect(name(page)).toHaveValue('B71:B73')
})

test('right-neighbor fallback extends a numeric source only to the first gap', async ({ page }) => {
  for (const [address, coord, value] of [
    ['A50', '49:0', '1'], ['A51', '50:0', '3'],
    ['B50', '49:1', '0'], ['B51', '50:1', 'FALSE'], ['B52', '51:1', '6'],
    ['B54', '53:1', '9'],
  ]) await write(page, address!, coord!, value!)
  await select(page, 'A50:A51', '50:0')
  await handle(page).dblclick()
  await expect(name(page)).toHaveValue('A50:A52')
  await expect(cell(page, '51:0')).toHaveText('5')
  await expect(cell(page, '52:0')).toHaveText('')
  await expect(cell(page, '53:0')).toHaveText('')
})

test('merged destination rejects atomically and succeeds after unmerge', async ({ page }) => {
  const merge = page.getByRole('combobox', { name: 'Merge cells', exact: true })
  await select(page, 'B72:C72', '71:1')
  await merge.selectOption('merge')
  await expect(merge).toBeEnabled()
  await select(page, 'B71', '70:1')
  await handle(page).dblclick()
  await expect(page.getByLabel('Fill status')).toContainText('unmerge cells')
  await expect(name(page)).toHaveValue('B71')
  await expect(cell(page, '70:1')).toHaveText('4')
  await select(page, 'B72:C72', '71:1')
  await merge.selectOption('unmerge')
  await expect(merge).toBeEnabled()
  await select(page, 'B71', '70:1')
  await handle(page).dblclick()
  await expect(name(page)).toHaveValue('B71:B73')
  await expect(cell(page, '72:1')).toHaveText('6')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '72:1')).toHaveText('')
})

test('Chinese feedback and tooltip cover double-click without a new language state', async ({ page }) => {
  await page.goto('/?locale=zh')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const box = page.getByRole('textbox', { name: '名称框' })
  await box.fill('D71')
  await box.press('Enter')
  const fill = page.getByRole('button', { name: '拖动填充', exact: true })
  await expect(fill).toHaveAttribute('title', /双击向下填充/)
  await fill.dblclick()
  await expect(page.getByLabel('填充状态')).toHaveText('相邻列没有可向下延续的连续数据。')
  await expect(box).toHaveValue('D71')
})
