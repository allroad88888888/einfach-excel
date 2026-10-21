import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const actions = [
  { axis: 'row', label: '2', key: 'ArrowUp', before: 28, after: 18 },
  { axis: 'row', label: '2', key: 'ArrowDown', before: 28, after: 38 },
  { axis: 'column', label: 'B', key: 'ArrowLeft', before: 120, after: 110 },
  { axis: 'column', label: 'B', key: 'ArrowRight', before: 120, after: 130 },
] as const

for (const width of [1280, 390]) test.describe(`${width}px keyboard resize`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B2', '1:1')
  })

  for (const { axis, label, key, before, after } of actions)
    test(`resize ${axis} ${key} changes exactly ten pixels with one undo at ${width}px`, async ({ page }) => {
      const dimension = axis === 'row' ? 'height' : 'width'
      const handle = page.getByRole('separator', { name: `Resize ${axis} ${label}`, exact: true })
      const header = page.getByRole(axis === 'row' ? 'button' : 'columnheader', {
        name: `Select ${axis} ${label}`, exact: true,
      })
      const neighbor = (await cell(page, '2:2').boundingBox())![dimension]
      await expect(handle).toHaveAttribute('aria-valuenow', String(before))
      await handle.press(key)
      await expect(handle).toHaveAttribute('aria-valuenow', String(after))
      await expect.poll(async () => (await header.boundingBox())![dimension]).toBe(after)
      await expect.poll(async () => (await cell(page, '1:1').boundingBox())![dimension]).toBe(after)
      expect((await cell(page, '2:2').boundingBox())![dimension]).toBe(neighbor)
      await expect(handle).toBeFocused()
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('.resize-guide')).toHaveCount(0)
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(handle).toHaveAttribute('aria-valuenow', String(before))
      await expect.poll(async () => (await header.boundingBox())![dimension]).toBe(before)
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(handle).toHaveAttribute('aria-valuenow', String(after))
      await expect.poll(async () => (await cell(page, '1:1').boundingBox())![dimension]).toBe(after)
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '2:2')).toHaveText('East')
    })
})
