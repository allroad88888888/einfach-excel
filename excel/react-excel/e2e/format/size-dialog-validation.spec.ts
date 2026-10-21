import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const axes = [
  { name: 'row', input: 'Row height', action: 'Set row height', handle: 'Resize row 2',
    invalid: ['15', '513', '28.5', ''], before: '28', after: '44', dimension: 'height' },
  { name: 'column', input: 'Column width', action: 'Set column width', handle: 'Resize column B',
    invalid: ['39', '1025', '120.5', ''], before: '120', after: '200', dimension: 'width' },
] as const

for (const width of [1280, 390]) test.describe(`${width}px size validation`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B2', '1:1')
  })

  test(`open size dialog reads native dimensions without mutation at ${width}px`, async ({ page }) => {
    await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Row and column size', exact: true })
    await expect(dialog).toBeInViewport()
    await expect(dialog.getByRole('spinbutton', { name: 'Row height' })).toHaveValue('28')
    await expect(dialog.getByRole('spinbutton', { name: 'Row height' })).toBeFocused()
    await expect(dialog.getByRole('spinbutton', { name: 'Column width' })).toHaveValue('120')
    await expect(dialog.getByRole('button', { name: 'Set column width' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  })

  for (const axis of axes)
    test(`invalid ${axis.name} size can correct without partial writes at ${width}px`, async ({ page }) => {
      await select(page, 'H2', '1:7')
      const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
      const undo = page.getByRole('button', { name: 'Undo', exact: true })
      const redo = page.getByRole('button', { name: 'Redo', exact: true })
      await bar.fill('Keep invalid size redo')
      await bar.press('Enter')
      await expect(cell(page, '1:7')).toHaveText('Keep invalid size redo')
      await undo.click()
      await select(page, 'B2', '1:1')
      const neighbor = (await cell(page, '2:2').boundingBox())![axis.dimension]
      const handle = page.getByRole('separator', { name: axis.handle, exact: true })
      await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Row and column size', exact: true })
      const input = dialog.getByRole('spinbutton', { name: axis.input })
      for (const invalid of axis.invalid) {
        await input.fill(invalid)
        await dialog.getByRole('button', { name: axis.action, exact: true }).click()
        // HTML 的 required/min/max/step 在提交前拦截，不伪造 Core 错误提示。
        expect(await input.evaluate(node => (node as HTMLInputElement).validity.valid)).toBe(false)
        await expect(dialog).toBeVisible()
        await expect(handle).toHaveAttribute('aria-valuenow', axis.before)
      }
      await expect(undo).toBeDisabled()
      await expect(redo).toBeEnabled()
      await input.fill(axis.after)
      await dialog.getByRole('button', { name: axis.action, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(handle).toHaveAttribute('aria-valuenow', axis.after)
      expect((await cell(page, '2:2').boundingBox())![axis.dimension]).toBe(neighbor)
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await undo.click()
      await expect(handle).toHaveAttribute('aria-valuenow', axis.before)
      await expect(undo).toBeDisabled()
      await redo.click()
      await expect(handle).toHaveAttribute('aria-valuenow', axis.after)
    })
})
