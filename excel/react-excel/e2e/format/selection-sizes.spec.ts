import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}
async function size(page: Page, axis: 'row' | 'column', value: number) {
  await open(page)
  await page
    .getByRole('spinbutton', { name: axis === 'row' ? 'Row height' : 'Column width' })
    .fill(String(value))
  await page
    .getByRole('button', { name: axis === 'row' ? 'Set row height' : 'Set column width' })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('row height affects selected rows only and preserves formulas and style', async ({ page }) => {
  await select(page, 'B2:C4')
  await size(page, 'row', 44)
  for (const row of [1, 2, 3]) {
    await expect.poll(async () => (await cell(page, `${row}:1`).boundingBox())?.height).toBe(44)
    await expect
      .poll(
        async () =>
          (
            await page
              .getByRole('button', { name: `Select row ${row + 1}`, exact: true })
              .boundingBox()
          )?.height,
      )
      .toBe(44)
  }
  await expect.poll(async () => (await cell(page, '4:1').boundingBox())?.height).toBe(28)
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '1:6')).toHaveText('79')
})

test('column width aligns headers, selection outline and cell editor', async ({ page }) => {
  await select(page, 'B2:C4')
  await size(page, 'column', 200)
  await expect.poll(async () => (await cell(page, '1:1').boundingBox())?.width).toBe(200)
  await expect
    .poll(
      async () =>
        (
          await page
            .getByRole('columnheader', { name: 'Select column B', exact: true })
            .boundingBox()
        )?.width,
    )
    .toBe(200)
  await expect
    .poll(async () => (await page.locator('.selection-outline').boundingBox())?.width)
    .toBe(400)
  const before = await cell(page, '1:2').boundingBox()
  await cell(page, '1:2').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toBeVisible()
  expect((await editor.boundingBox())?.x).toBe(before?.x)
  expect((await editor.boundingBox())?.width).toBe(200)
  await editor.fill('Resized')
  await editor.press('Enter')
  await expect(cell(page, '1:2')).toHaveText('Resized')
})

test('reset restores defaults only for selected rows and columns', async ({ page }) => {
  await select(page, 'B2:C4')
  await size(page, 'row', 44)
  await size(page, 'column', 200)
  await select(page, 'B2')
  await open(page)
  await page.getByRole('button', { name: 'Reset selected sizes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await cell(page, '1:1').boundingBox())?.height).toBe(28)
  await expect.poll(async () => (await cell(page, '1:1').boundingBox())?.width).toBe(120)
  await expect.poll(async () => (await cell(page, '2:2').boundingBox())?.height).toBe(44)
  await expect.poll(async () => (await cell(page, '2:2').boundingBox())?.width).toBe(200)
  await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
})

test('manual small row clips large text instead of breaking grid geometry', async ({ page }) => {
  await select(page, 'B3')
  await page.getByRole('combobox', { name: 'Font size' }).selectOption('36')
  await page.getByRole('button', { name: 'Borders', exact: true }).click()
  await page.getByRole('button', { name: 'Text rotation', exact: true }).click()
  await size(page, 'row', 16)
  await expect.poll(async () => (await cell(page, '2:1').boundingBox())?.height).toBe(16)
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '36px')
  await expect
    .poll(
      async () =>
        (await page.getByRole('button', { name: 'Select row 3', exact: true }).boundingBox())
          ?.height,
    )
    .toBe(16)
})

test('offscreen row sizes survive navigation and sheet switching', async ({ page }) => {
  await select(page, 'B2:B1001')
  await size(page, 'row', 40)
  await select(page, 'B1001')
  await expect.poll(async () => (await cell(page, '1000:1').boundingBox())?.height).toBe(40)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'B900')
  await expect.poll(async () => (await cell(page, '899:1').boundingBox())?.height).toBe(40)
})

test('wide columns still reach the right edge using Command ArrowRight', async ({ page }) => {
  await select(page, 'A1:P1')
  await size(page, 'column', 240)
  await select(page, 'A2')
  await page.locator('[data-workbook-grid="true"]').press('Meta+ArrowRight')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('P2')
  await expect(cell(page, '1:15')).toBeInViewport()
  const scroll = await page.getByTestId('sheet-scroll').boundingBox()
  expect((await cell(page, '1:15').boundingBox())!.x + 240).toBeLessThanOrEqual(
    scroll!.x + scroll!.width + 1,
  )
})

test('Summary demonstrates native initial row and column sizes without changing Orders', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.height).toBe(40)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.width).toBe(200)
  await expect(cell(page, '0:1')).toHaveText('79')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.width).toBe(120)
})

test('size dialog is usable at desktop and narrow widths and Escape cancels', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await select(page, 'A2')
    await open(page)
    await expect(page.getByRole('spinbutton', { name: 'Row height' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Set column width' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`selection-sizes-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Row and column size', exact: true }),
    ).toBeFocused()
  }
  expect(errors).toEqual([])
})
