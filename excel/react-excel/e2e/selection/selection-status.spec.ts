import { expect, test, type Page } from '@playwright/test'

const status = (page: Page) => page.getByRole('status', { name: 'Selection statistics' })
async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
}
async function summary(page: Page) {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A93:F93')
}
async function stats(page: Page, count: number, sum: string, average: string) {
  await expect(status(page)).toContainText(`Numerical count: ${count}`)
  await expect(status(page)).toContainText(`Sum: ${sum}`)
  await expect(status(page)).toContainText(`Average: ${average}`)
}
async function extrema(page: Page, count: number, min: string, max: string) {
  await expect(status(page).getByText(`Count: ${count}`, { exact: true })).toBeVisible()
  await expect(status(page).getByText(`Min: ${min}`, { exact: true })).toBeVisible()
  await expect(status(page).getByText(`Max: ${max}`, { exact: true })).toBeVisible()
}

test('seed types use native numbers, and editing, undo and redo refresh statistics', async ({ page }) => {
  await summary(page)
  await stats(page, 4, '26', '6.5')
  await extrema(page, 6, '-4', '20')
  await page.locator('td[data-cell="92:0"]').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor' })
  await editor.fill('20')
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
  await select(page, 'A93:F93')
  await stats(page, 4, '56', '14')
  await extrema(page, 6, '-4', '40')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A93:F93')
  await stats(page, 4, '26', '6.5')
  await extrema(page, 6, '-4', '20')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await select(page, 'A93:F93')
  await stats(page, 4, '56', '14')
  await extrema(page, 6, '-4', '40')
  await select(page, 'A95:F95')
  await stats(page, 0, '—', '—')
  await extrema(page, 0, '—', '—')
  await select(page, 'E93:F93')
  await stats(page, 0, '—', '—')
  await extrema(page, 2, '—', '—')
})

test('empty strings and errors count as content, but clearing a minimum removes it from extrema', async ({ page }) => {
  await summary(page)
  await select(page, 'A94:C94')
  await stats(page, 0, '—', '—')
  await extrema(page, 3, '—', '—')
  await expect(page.locator('td[data-cell="93:2"]')).toHaveText('#DIV/0!')
  await select(page, 'C93')
  await page.keyboard.press('Delete')
  await expect(page.locator('td[data-cell="92:2"]')).toHaveText('')
  await select(page, 'A93:F93')
  await extrema(page, 5, '0', '20')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A93:F93')
  await extrema(page, 6, '-4', '20')
})

test('an entire column includes offscreen formulas and scrolling keeps the same statistics', async ({ page }) => {
  await summary(page)
  await page.getByRole('columnheader', { name: 'Select column D', exact: true }).click()
  await stats(page, 1, '20', '20')
  const before = await status(page).textContent()
  await page.getByTestId('sheet-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(page.locator('td[data-cell="92:3"]')).toBeVisible()
  await expect(status(page)).toHaveText(before!)
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'G2')
  const total = await status(page).textContent()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B1')
  await expect(status(page)).toHaveText(total!)
})

for (const width of [1280, 390]) {
  test(`statistics fit ${width}px without covering cells or overflowing`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await summary(page)
    await stats(page, 4, '26', '6.5')
    await extrema(page, 6, '-4', '20')
    const footer = page.locator('.workbook-footer')
    expect(await footer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    for (const span of await status(page).locator('span').all()) {
      await expect(span).toBeInViewport()
      expect(await span.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11)
    }
    const box = await footer.boundingBox()
    const grid = await page.getByTestId('sheet-scroll').boundingBox()
    expect(grid!.y + grid!.height).toBeLessThanOrEqual(box!.y + 1)
    await page.screenshot({ path: info.outputPath(`selection-statistics-${width}.png`) })
    expect(errors).toEqual([])
  })
}
