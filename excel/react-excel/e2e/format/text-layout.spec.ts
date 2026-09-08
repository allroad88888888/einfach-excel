import { expect, test } from '@playwright/test'

async function selectTestCell(page: import('@playwright/test').Page) {
  await page.goto('/')
  const cell = page.locator('td[data-cell="2:1"]')
  await expect(cell).toBeVisible()
  await cell.click()
  return cell
}

test('font family is written through Rust and reflected by the ribbon', async ({ page }) => {
  const cell = await selectTestCell(page)
  const fontFamily = page.getByRole('combobox', { name: 'Font family' })

  await fontFamily.selectOption('Georgia')
  await expect(fontFamily).toHaveValue('Georgia')
  await expect(cell).toHaveCSS('font-family', /Georgia/)
})

test('font size is written through Rust and reflected by the ribbon', async ({ page }) => {
  const cell = await selectTestCell(page)
  const fontSize = page.getByRole('combobox', { name: 'Font size' })

  await expect(fontSize).toHaveCSS('width', '56px')
  await fontSize.selectOption('16')
  await expect(fontSize).toHaveValue('16')
  await expect(cell).toHaveCSS('font-size', '16px')
})

test('a 36px cell font grows only its own row', async ({ page }) => {
  const cell = await selectTestCell(page)
  const rowBefore = await cell.boundingBox()
  const nextRow = page.locator('td[data-cell="3:1"]')
  const nextRowBefore = await nextRow.boundingBox()

  await page.getByRole('combobox', { name: 'Font size' }).selectOption('36')
  await expect(cell).toHaveCSS('font-size', '36px')
  await expect.poll(async () => (await cell.boundingBox())?.height).toBeGreaterThan(36)
  const grownRow = await cell.boundingBox()
  expect((await nextRow.boundingBox())?.height).toBe(nextRowBefore?.height)
  expect((await nextRow.boundingBox())?.y).toBe(
    (nextRowBefore?.y ?? 0) + (grownRow?.height ?? 0) - (rowBefore?.height ?? 0),
  )
  expect((await page.locator('.row-headers .sheet-heading').nth(2).boundingBox())?.height).toBe(
    grownRow?.height,
  )
})

test('wrap text toggles the selected Rust cell style', async ({ page }) => {
  const cell = await selectTestCell(page)
  const wrap = page.getByRole('button', { name: 'Wrap text' })

  await wrap.click()
  await expect(wrap).toHaveAttribute('aria-pressed', 'true')
  await expect(cell).toHaveCSS('white-space', 'pre-wrap')
  await wrap.click()
  await expect(wrap).toHaveAttribute('aria-pressed', 'false')
  await expect(cell).toHaveCSS('white-space', 'nowrap')
})

test('indent can increase and decrease through Rust', async ({ page }) => {
  const cell = await selectTestCell(page)
  const increase = page.getByRole('button', { name: 'Increase indent' })
  const decrease = page.getByRole('button', { name: 'Decrease indent' })

  await increase.click()
  await expect(cell).toHaveCSS('padding-left', '8px')
  await increase.click()
  await expect(cell).toHaveCSS('padding-left', '16px')
  await decrease.click()
  await expect(cell).toHaveCSS('padding-left', '8px')
  await decrease.click()
  await expect(cell).toHaveCSS('padding-left', '7px')
})

test('shows the text layout examples from the original Rust seed', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:6"]')).toHaveCSS('font-family', /Georgia/)
  await expect(page.locator('td[data-cell="1:7"]')).toHaveCSS('font-size', '16px')
  await expect(page.locator('td[data-cell="1:8"]')).toHaveCSS('white-space', 'pre-wrap')
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.fill('N2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:13"]')).toHaveCSS('padding-left', '16px')
})
