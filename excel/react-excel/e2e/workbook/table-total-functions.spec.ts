import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })

async function open(page: Page) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table DemoTable').click()
}

async function applyFunction(page: Page, value: string) {
  await page.getByLabel('Total function', { exact: true }).selectOption(value)
  await button(page, 'Apply total').click()
  await expect(button(page, 'Apply total')).toBeEnabled()
  await expect(page.getByLabel('Total function', { exact: true })).toHaveValue(value)
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog', { name: 'Tables', exact: true })).toHaveCount(0)
}

// 每个选项从原生种子独立运行；求和先用 UI 改为平均值，避免把无操作当作成功写入。
const cases = [
  { value: 'none', column: 'Amount', display: '', raw: '', previous: '60', previousRaw: '=SUBTOTAL(109,DemoTable[Amount])' },
  { value: 'sum', column: 'Amount', display: '60', raw: '=SUBTOTAL(109,DemoTable[Amount])', previous: '20', previousRaw: '=SUBTOTAL(101,DemoTable[Amount])' },
  { value: 'average', column: 'Amount', display: '20', raw: '=SUBTOTAL(101,DemoTable[Amount])', previous: '60', previousRaw: '=SUBTOTAL(109,DemoTable[Amount])' },
  { value: 'count', column: 'Product', display: '3', raw: '=SUBTOTAL(103,DemoTable[Product])', previous: '', previousRaw: '' },
  { value: 'countNums', column: 'Product', display: '0', raw: '=SUBTOTAL(102,DemoTable[Product])', previous: '', previousRaw: '' },
  { value: 'max', column: 'Amount', display: '30', raw: '=SUBTOTAL(104,DemoTable[Amount])', previous: '60', previousRaw: '=SUBTOTAL(109,DemoTable[Amount])' },
  { value: 'min', column: 'Amount', display: '10', raw: '=SUBTOTAL(105,DemoTable[Amount])', previous: '60', previousRaw: '=SUBTOTAL(109,DemoTable[Amount])' },
  { value: 'stdDev', column: 'Amount', display: '10', raw: '=SUBTOTAL(107,DemoTable[Amount])', previous: '60', previousRaw: '=SUBTOTAL(109,DemoTable[Amount])' },
  { value: 'var', column: 'Amount', display: '100', raw: '=SUBTOTAL(110,DemoTable[Amount])', previous: '60', previousRaw: '=SUBTOTAL(109,DemoTable[Amount])' },
] as const

for (const width of [1280, 390]) test.describe(`${width}px total functions`, () => {
  test.use({ viewport: { width, height: 850 } })

  for (const entry of cases) test(`total ${entry.value} preserves data and undoes once at ${width}px`, async ({ page }) => {
    await page.goto('/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const targetCoord = entry.column === 'Product' ? '83:0' : '83:1'
    await select(page, entry.column === 'Product' ? 'A84' : 'B84', targetCoord)
    await expect(cell(page, targetCoord)).toHaveText(entry.column === 'Product' ? '' : '60')
    await expect(button(page, 'Undo')).toBeDisabled()
    await open(page)
    await page.getByLabel('Total column', { exact: true }).selectOption(entry.column)
    if (entry.value === 'sum') {
      await applyFunction(page, 'average')
      await expect(cell(page, '83:1')).toHaveText('20')
      await open(page)
    }
    await applyFunction(page, entry.value)
    await expect(cell(page, targetCoord)).toHaveText(entry.display)
    await expect(formula(page)).toHaveValue(entry.raw)
    for (const [row, value] of [[80, '10'], [81, '20'], [82, '30']] as const) {
      await expect(cell(page, `${row}:1`)).toHaveText(value)
    }
    await expect(cell(page, entry.column === 'Product' ? '83:1' : '83:0')).toHaveText(entry.column === 'Product' ? '60' : '')
    await expect(cell(page, '79:1')).toHaveText('Amount')
    await expect(cell(page, '80:0')).toHaveText('Keyboard')
    await button(page, 'Undo').click()
    await expect(cell(page, targetCoord)).toHaveText(entry.previous)
    await expect(formula(page)).toHaveValue(entry.previousRaw)
    if (entry.value !== 'sum') await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, targetCoord)).toHaveText(entry.display)
    await expect(formula(page)).toHaveValue(entry.raw)
    await open(page)
    await page.getByLabel('Total column', { exact: true }).selectOption(entry.column)
    await expect(page.getByLabel('Total function', { exact: true })).toHaveValue(entry.value)
  })
})
