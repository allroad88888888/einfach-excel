import { expect, test } from '@playwright/test'
import { start, enable, open, rank, apply, visible, undoRedo, dialog, button, cell } from '../support/top-filter'

for (const width of [1280, 390]) {
  test(`top items filter uses numeric ranks and cutoff ties in one undo at ${width}px`, async ({ page }, info) => {
    await start(page, width); await enable(page); await open(page); await rank(page)
    await expect(dialog(page).getByLabel('Rank amount 1', { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`top-items-${width}.png`) })
    await apply(page); await undoRedo(page, [0, 1, 2])
    await expect(cell(page, '2:5')).toHaveText('100')
    await expect(cell(page, '3:5')).toHaveText('90')
    await open(page)
    await expect(dialog(page).getByLabel('Rank amount 1', { exact: true })).toHaveValue('2')
  })

  test(`top percent rounds up numeric population and retains ties at ${width}px`, async ({ page }) => {
    await start(page, width); await enable(page); await open(page)
    await rank(page, '21', 'top', 'percent')
    await apply(page); await undoRedo(page, [0, 1, 2])
  })
}

test('top ranks the original domain before intersecting another column', async ({ page }) => {
  await start(page); await enable(page); await open(page, 'E')
  await dialog(page).getByLabel('Filter condition 1', { exact: true }).selectOption('contains')
  await dialog(page).getByLabel('Filter value 1', { exact: true }).fill('Keep')
  await apply(page); await visible(page, [1, 2, 3, 4, 5, 6])
  await open(page); await rank(page); await apply(page)
  await visible(page, [1, 2])
  await button(page, 'Undo').click(); await visible(page, [1, 2, 3, 4, 5, 6])
  await button(page, 'Redo').click(); await visible(page, [1, 2])
})

test('top condition keyboard activation submits through the header dialog', async ({ page }) => {
  await start(page); await enable(page)
  await button(page, 'Filter column F').focus(); await page.keyboard.press('Enter')
  await dialog(page).getByRole('button', { name: 'Top / Bottom…', exact: true }).focus()
  await page.keyboard.press('Enter')
  await dialog(page).getByLabel('Rank amount 1', { exact: true }).fill('1')
  await dialog(page).getByLabel('Rank amount 1', { exact: true }).press('Enter')
  await expect(dialog(page)).toHaveCount(0)
  await expect(button(page, 'Filter column F')).toBeFocused()
  await undoRedo(page, [0])
})
