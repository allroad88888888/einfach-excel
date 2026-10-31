import { expect, test, type Locator, type Page } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

async function chooseCenterAcross(page: Page) {
  const control = page.getByRole('combobox', { name: 'Horizontal alignment', exact: true })
  await control.selectOption('centerAcross')
  await expect(control).toBeEnabled()
  await expect(control).toHaveValue('centerAcross')
}

async function type(page: Page, address: string, coord: string, text: string) {
  await select(page, address, coord)
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill(text)
  await formula.press('Enter')
}

/** 文字实际渲染的盒子（Range 矩形）与若干单元格并集的水平中心。 */
async function centers(content: Locator, cells: Locator[]) {
  const text = await content.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    const box = range.getBoundingClientRect()
    return { left: box.left, right: box.right }
  })
  const boxes = await Promise.all(cells.map((target) => target.boundingBox()))
  const left = Math.min(...boxes.map((box) => box!.x))
  const right = Math.max(...boxes.map((box) => box!.x + box!.width))
  return {
    text: (text.left + text.right) / 2,
    span: (left + right) / 2,
    textWidth: text.right - text.left,
  }
}

// 新建的空白工作表 A:C。
const C0 = 0
const ROW = 5
async function titleRow(page: Page) {
  await type(page, `A${ROW}`, `${ROW - 1}:${C0}`, 'Quarterly Report')
  await select(page, `A${ROW}:C${ROW}`, `${ROW - 1}:${C0}`)
  await chooseCenterAcross(page)
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveText('')
})

test('center across selection centers the text across empty neighbours without merging', async ({ page }) => {
  await titleRow(page)
  const a = cell(page, `${ROW - 1}:${C0}`)
  await expect(a).toHaveAttribute('data-center-across', '3')
  await expect(a).toHaveText('Quarterly Report')
  await expect(cell(page, `${ROW - 1}:${C0 + 1}`)).not.toHaveAttribute('data-center-across')
  const { text, span, textWidth } = await centers(a.locator('.cell-content'),
    [a, cell(page, `${ROW - 1}:${C0 + 1}`), cell(page, `${ROW - 1}:${C0 + 2}`)])
  expect(Math.abs(text - span)).toBeLessThan(2)
  const own = (await a.boundingBox())!
  expect(textWidth).toBeGreaterThan(0)
  expect(text).toBeGreaterThan(own.x + own.width / 2 + 5)
  await expect(page.locator('[data-merged-cell="true"]')).toHaveCount(0)
})

test('typing into the middle cell ends the center across span', async ({ page }) => {
  await titleRow(page)
  await type(page, `B${ROW}`, `${ROW - 1}:${C0 + 1}`, 'Stop')
  const a = cell(page, `${ROW - 1}:${C0}`)
  const b = cell(page, `${ROW - 1}:${C0 + 1}`)
  await expect(b).toHaveText('Stop')
  await expect(a).not.toHaveAttribute('data-center-across')
  await expect(b).toHaveAttribute('data-center-across', '2')
  const { text, span } = await centers(a.locator('.cell-content'), [a])
  expect(Math.abs(text - span)).toBeLessThan(2)
})

test('center across is one undo step and redo restores the span', async ({ page }) => {
  await titleRow(page)
  const a = cell(page, `${ROW - 1}:${C0}`)
  await expect(a).toHaveAttribute('data-center-across', '3')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(a).not.toHaveAttribute('data-center-across')
  await expect(a).toHaveText('Quarterly Report')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(a).toHaveAttribute('data-center-across', '3')
})

test('copy and paste keep center across on the pasted cells', async ({ page }) => {
  await titleRow(page)
  await select(page, `A${ROW}:C${ROW}`, `${ROW - 1}:${C0}`)
  await copy(page)
  await select(page, `A${ROW + 3}`, `${ROW + 2}:${C0}`)
  await paste(page)
  const pasted = cell(page, `${ROW + 2}:${C0}`)
  await expect(pasted).toHaveText('Quarterly Report')
  await expect(pasted).toHaveAttribute('data-center-across', '3')
})
