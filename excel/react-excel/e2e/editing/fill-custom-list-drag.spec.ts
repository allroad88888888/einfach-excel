import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, close, drag, open, panel, save, start } from '../support/custom-list-drag'

test.beforeEach(async ({ page }) => start(page))

async function verifyPartialCycle(page: import('@playwright/test').Page) {
  // Keep the intended destination away from the grid's 48px autoscroll edge zone.
  await select(page, 'D63', '62:3')
  await select(page, 'D55', '54:3')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('Medium')
  const target = (await cell(page, '57:3').boundingBox())!
  const viewport = (await page.getByTestId('sheet-scroll').boundingBox())!
  expect(target.y + target.height / 2).toBeLessThan(viewport.y + viewport.height - 48)
  await drag(page, 'D55:D56', '57:3')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('D55:D58')
  await expect(cell(page, '54:3')).toHaveText('Medium')
  await expect(cell(page, '55:3')).toHaveText('High')
  await expect(cell(page, '56:3')).toHaveText('Low')
  await expect(cell(page, '57:3')).toHaveText('Medium')
  for (const row of [54, 55, 56, 57])
    await expect(cell(page, `${row}:3`)).toHaveCSS('text-decoration-line', 'underline')
  await select(page, 'D59', '58:3')
  await expect(cell(page, '58:3')).toHaveText('901')
  await expect(cell(page, '58:3')).toHaveCSS('font-weight', '700')
  await select(page, 'C55', '54:2')
  await expect(cell(page, '54:2')).toHaveText('Nov')
  await expect(cell(page, '54:2')).toHaveCSS('font-style', 'italic')
  await select(page, 'E55', '54:4')
  await expect(cell(page, '54:4')).toHaveText('Low')
  await select(page, 'D57:D59', '56:3')
  await button(page, 'Undo').click()
  await expect(cell(page, '56:3')).toHaveText('')
  await expect(cell(page, '57:3')).toHaveText('')
  await expect(cell(page, '56:3')).toHaveCSS('text-decoration-line', 'none')
  await expect(cell(page, '54:3')).toHaveText('Medium')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '56:3')).toHaveText('Low')
  await expect(cell(page, '57:3')).toHaveText('Medium')
  await expect(cell(page, '58:3')).toHaveText('901')
}

test('saved custom list continues from a partial cycle through the fill handle with one undo', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await open(page)
  await save(page)
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(cell(page, '56:3')).toHaveText('')
  await page.screenshot({ path: info.outputPath('custom-list-drag-desktop-dialog.png') })
  await close(page)
  await verifyPartialCycle(page)
  await page.screenshot({ path: info.outputPath('custom-list-drag-desktop-result.png') })
  expect(errors).toEqual([])
})

test('saved partial-cycle drag and dialog remain usable at 390px', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 850 })
  await open(page)
  await save(page)
  for (const control of await panel(page).locator('input, select, textarea, button').all())
    await expect(control).toBeInViewport()
  await page.screenshot({ path: info.outputPath('custom-list-drag-mobile-dialog.png') })
  await close(page)
  await verifyPartialCycle(page)
  await page.screenshot({ path: info.outputPath('custom-list-drag-mobile-result.png') })
  expect(errors).toEqual([])
})
