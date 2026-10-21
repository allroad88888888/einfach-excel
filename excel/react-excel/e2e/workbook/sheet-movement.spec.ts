import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

// 左右移动各有独立入口，不能借切表掩盖原生 sheet 身份或选区漂移。
for (const width of [1280, 390]) for (const direction of ['left', 'right'] as const)
  test(`move sheet ${direction} preserves identity and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    const summary = direction === 'left'
    const source = summary ? 'Summary' : 'Sales Orders'
    if (summary) await page.getByRole('tab', { name: source, exact: true }).click()
    const range = summary ? 'A1:B2' : 'A2:C3'
    const coord = summary ? '0:0' : '1:0'
    const value = summary ? 'First order total' : 'SO-10001'
    await select(page, range, coord)
    const before = (await cell(page, coord).boundingBox())!
    const tabs = page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')
    const active = page.getByRole('tab', { name: source, exact: true })
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await page.getByRole('button', { name: `Move sheet ${direction}`, exact: true }).click()
    await expect(tabs).toHaveText(['Summary', 'Sales Orders'])
    await expect(active).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(range)
    await expect(cell(page, coord)).toHaveText(value)
    await expect(cell(page, coord)).toHaveCSS('font-weight', '700')
    const after = (await cell(page, coord).boundingBox())!
    expect([after.width, after.height]).toEqual([before.width, before.height])
    await expect(page.getByRole('button', { name: `Move sheet ${direction}`, exact: true })).toBeDisabled()
    await undo.click()
    await expect(tabs).toHaveText(['Sales Orders', 'Summary'])
    await expect(active).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(range)
    await expect(undo).toBeDisabled()
    await redo.click()
    await expect(tabs).toHaveText(['Summary', 'Sales Orders'])
    await expect(active).toHaveAttribute('aria-selected', 'true')
    await expect(cell(page, coord)).toHaveText(value)
    await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
    await select(page, 'E2', '1:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('3')
    await bar.press('Enter')
    await expect(cell(page, '1:4')).toHaveText('3')
    await select(page, 'B2', '1:1')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'B1', '0:1')
    await expect(cell(page, '0:1')).toHaveText('237')
    await expect(bar).toHaveValue("='Sales Orders'!G2")
  })
