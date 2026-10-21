import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function rowLevel(page: Page, level: number) {
  if (level === 1) {
    for (const row of [7, 8, 9, 10, 11]) await expect(cell(page, `${row}:0`)).toHaveCount(0)
    await expect(button(page, 'Expand rows 8–12, level 1')).toBeVisible()
    await expect(button(page, 'Expand rows 9–11, level 2')).toHaveCount(0)
  } else {
    await expect(cell(page, '7:0')).toHaveText('Outline')
    await expect(cell(page, '11:1')).toHaveText(level === 2 ? '0' : '30')
    for (const [coord, value] of [['8:0', 'Detail 1'], ['10:0', 'Detail 2']]) {
      if (level === 2) await expect(cell(page, coord)).toHaveCount(0)
      else await expect(cell(page, coord)).toHaveText(value)
    }
    await expect(button(page, `${level === 2 ? 'Expand' : 'Collapse'} rows 9–11, level 2`))
      .toHaveAttribute('aria-expanded', String(level === 3))
  }
  await expect(cell(page, '9:0')).toHaveCount(0)
  await expect(cell(page, '0:1')).toHaveText('79')
  await expect(cell(page, '0:6')).toHaveCount(0)
  await expect(button(page, 'Show column outline level 2')).toBeVisible()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await rowLevel(page, 3)
})

for (const level of [1, 2, 3]) for (const width of [1280, 390])
  test(`row outline level ${level} applies the native nesting threshold in one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    if (level === 3) {
      await button(page, 'Collapse rows 9–11, level 2').click()
      await rowLevel(page, 2)
    }
    await button(page, `Show row outline level ${level}`).click()
    await rowLevel(page, level)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await button(page, 'Undo').click()
    await rowLevel(page, level === 3 ? 2 : 3)
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText(`${level === 3 ? 1 : 0} undo · 1 redo`)
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await rowLevel(page, level)
  })

for (const level of [1, 2]) for (const width of [1280, 390])
  test(`column outline level ${level} preserves manual hiding in one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const menu = page.getByRole('combobox', { name: 'Outline groups' })
    if (level === 2) {
      await menu.selectOption('collapse-columns')
      await expect(cell(page, '1:4')).toHaveCount(0)
    }
    await button(page, `Show column outline level ${level}`).click()
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    for (const col of [4, 5]) {
      if (level === 1) await expect(cell(page, `1:${col}`)).toHaveCount(0)
      else await expect(cell(page, `1:${col}`)).toBeVisible()
    }
    await expect(cell(page, '0:6')).toHaveCount(0)
    await expect(cell(page, '11:1')).toHaveText('30')
    await expect(cell(page, '8:0')).toHaveText('Detail 1')
    await expect(cell(page, '9:0')).toHaveCount(0)
    await expect(cell(page, '0:1')).toHaveText('79')
    await button(page, 'Undo').click()
    if (level === 1) await expect(cell(page, '1:4')).toBeVisible()
    else await expect(cell(page, '1:4')).toHaveCount(0)
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText(`${level === 1 ? 0 : 1} undo · 1 redo`)
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    if (level === 1) await expect(cell(page, '1:4')).toHaveCount(0)
    else await expect(cell(page, '1:4')).toBeVisible()
    await expect(cell(page, '0:6')).toHaveCount(0)
  })
