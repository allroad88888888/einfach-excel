import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Cell editor', exact: true })
const formula = (page: Page) =>
  page.getByRole('textbox', { name: 'Active cell value', exact: true })

async function destination(page: Page, address = 'B10', coord = '9:1') {
  const target = await select(page, address, coord)
  await page.getByTestId('sheet-scroll').evaluate((node) => {
    node.scrollTop = 0
  })
  await expect(cell(page, '1:0')).toBeVisible()
  return target
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('CALC-046 editing a formula in the cell editor or formula bar colors each reference token and highlights referenced cells on the grid', async ({
  page,
}) => {
  const target = await destination(page)
  await target.dblclick()
  await editor(page).fill('=E2*F2')

  const cellTokens = page.locator('.cell-editor .formula-ref-token')
  await expect(cellTokens).toHaveCount(2)
  await expect(cellTokens.nth(0)).toHaveText('E2')
  await expect(cellTokens.nth(0)).toHaveAttribute('data-ref-color', '0')
  await expect(cellTokens.nth(1)).toHaveText('F2')
  await expect(cellTokens.nth(1)).toHaveAttribute('data-ref-color', '1')

  const barTokens = page.locator('.formula-input-shell .formula-ref-token')
  await expect(barTokens).toHaveCount(2)
  await expect(barTokens.nth(0)).toHaveAttribute('data-ref-color', '0')
  await expect(barTokens.nth(1)).toHaveAttribute('data-ref-color', '1')

  const rangeE2 = page.locator('.formula-ref-range[data-formula-ref="E2"]')
  const rangeF2 = page.locator('.formula-ref-range[data-formula-ref="F2"]')
  await expect(rangeE2).toBeVisible()
  await expect(rangeE2).toHaveAttribute('data-ref-color', '0')
  await expect(rangeF2).toBeVisible()
  await expect(rangeF2).toHaveAttribute('data-ref-color', '1')

  const e2Box = (await cell(page, '1:4').boundingBox())!
  const rangeE2Box = (await rangeE2.boundingBox())!
  expect(Math.abs(rangeE2Box.x - e2Box.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(rangeE2Box.y - e2Box.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(rangeE2Box.width - e2Box.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(rangeE2Box.height - e2Box.height)).toBeLessThanOrEqual(2)

  const token0Color = await cellTokens.nth(0).evaluate((el) => getComputedStyle(el).color)
  const token1Color = await cellTokens.nth(1).evaluate((el) => getComputedStyle(el).color)
  const range0Color = await rangeE2.evaluate((el) => getComputedStyle(el).borderTopColor)
  const range1Color = await rangeF2.evaluate((el) => getComputedStyle(el).borderTopColor)
  expect(token0Color).toBe(range0Color)
  expect(token1Color).toBe(range1Color)
  expect(token0Color).not.toBe(token1Color)

  await editor(page).press('Enter')
  await expect(target).toHaveText('79')
  await expect(page.locator('.formula-ref-range')).toHaveCount(0)
  await expect(page.locator('.formula-ref-token')).toHaveCount(0)

  await select(page, 'B10', '9:1')
  await formula(page).focus()
  await expect(barTokens).toHaveCount(2)
  await expect(rangeE2).toBeVisible()
  await expect(rangeF2).toBeVisible()
  await formula(page).press('Escape')
  await expect(page.locator('.formula-ref-range')).toHaveCount(0)
})

test('CALC-047 duplicate references share the same color and cross-sheet references highlight when viewing the target sheet', async ({
  page,
}) => {
  await destination(page)
  await formula(page).fill("=E2+'Summary'!B1:B2+$E$2+")

  const barTokens = page.locator('.formula-input-shell .formula-ref-token')
  await expect(barTokens).toHaveCount(3)
  await expect(barTokens.nth(0)).toHaveText('E2')
  await expect(barTokens.nth(0)).toHaveAttribute('data-ref-color', '0')
  await expect(barTokens.nth(1)).toHaveText("'Summary'!B1:B2")
  await expect(barTokens.nth(1)).toHaveAttribute('data-ref-color', '1')
  await expect(barTokens.nth(2)).toHaveText('$E$2')
  await expect(barTokens.nth(2)).toHaveAttribute('data-ref-color', '0')

  await expect(page.locator('.formula-ref-range')).toHaveCount(1)
  await expect(page.locator('.formula-ref-range[data-formula-ref="E2"]')).toHaveAttribute(
    'data-ref-color',
    '0',
  )

  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )

  const summaryRange = page.locator('.formula-ref-range[data-formula-ref="B1:B2"]')
  await expect(summaryRange).toBeVisible()
  await expect(summaryRange).toHaveAttribute('data-ref-color', '1')
  await expect(page.locator('.formula-ref-range[data-formula-ref="E2"]')).toHaveCount(0)

  const b1Box = (await cell(page, '0:1').boundingBox())!
  const b2Box = (await cell(page, '1:1').boundingBox())!
  const summaryRangeBox = (await summaryRange.boundingBox())!
  expect(Math.abs(summaryRangeBox.x - b1Box.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(summaryRangeBox.y - b1Box.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(summaryRangeBox.height - (b1Box.height + b2Box.height))).toBeLessThanOrEqual(2)

  await formula(page).press('Escape')
  await expect(page.locator('.formula-ref-range')).toHaveCount(0)
})
