import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

const brush = (page: Page) => page.getByRole('button', { name: 'Format painter', exact: true })
const cell = (page: Page, coord: string) => page.locator(`[data-cell="${coord}"]`)
async function arm(page: Page, sticky = false) {
  if (sticky) await brush(page).dblclick()
  else await brush(page).click()
  await expect(brush(page)).toHaveAttribute('data-painter-mode', sticky ? 'sticky' : 'armed')
  await expect(brush(page)).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByLabel('Format painter status')).toContainText('Select cells')
}
async function paintByKeyboard(page: Page, address: string, coord: string) {
  await select(page, address, coord)
  await page.locator('[data-workbook-grid]').press('Enter')
  await expect(page.getByLabel('Format painter status')).toContainText('Formatting applied.')
}
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('single paint copies seeded bold, retains target content, exits and undoes once', async ({ page }) => {
  await select(page, 'A2', '1:0')
  const before = await cell(page, '9:1').textContent()
  await arm(page)
  await cell(page, '9:1').click()
  await expect(cell(page, '9:1')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '9:1')).toHaveText(before!)
  await expect(brush(page)).toHaveAttribute('data-painter-mode', 'idle')
  await cell(page, '10:1').click()
  await expect(cell(page, '10:1')).toHaveCSS('font-weight', '400')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '9:1')).toHaveCSS('font-weight', '400')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '9:1')).toHaveCSS('font-weight', '700')
})

test('drag paints a tiled heterogeneous source range without replacing values', async ({ page }) => {
  await select(page, 'A2:B3', '1:0')
  await arm(page)
  const start = await cell(page, '9:3').boundingBox()
  const end = await cell(page, '12:4').boundingBox()
  await page.mouse.move(start!.x + 10, start!.y + 10)
  await page.mouse.down()
  await page.mouse.move(end!.x + 10, end!.y + 10, { steps: 8 })
  await expect(cell(page, '9:3')).toHaveCSS('font-weight', '400')
  await page.mouse.up()
  await expect(cell(page, '9:3')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '9:4')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '10:3')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '11:3')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '11:4')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '12:4')).toHaveCSS('font-style', 'normal')
  await expect(cell(page, '9:4')).toHaveText('9')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '9:3')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '11:4')).toHaveCSS('font-style', 'normal')
})

test('plain source removes destination styling rather than only patching positive fields', async ({ page }) => {
  await select(page, 'A3', '2:0')
  await arm(page)
  await select(page, 'A2', '1:0')
  await cell(page, '1:0').click()
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
})

test('number format paints a formula result without changing the formula', async ({ page }) => {
  await select(page, 'G13', '12:6')
  await arm(page)
  await paintByKeyboard(page, 'G2', '1:6')
  await expect(cell(page, '1:6')).toHaveText('7.90E+01')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:6')).toHaveText('79')
})

test('seeded underline, fill, text color and alignment all replace target appearance', async ({ page }) => {
  for (const [address, coord, property, value] of [
    ['C2', '1:2', 'text-decoration-line', 'underline'],
    ['D2', '1:3', 'background-color', 'rgb(255, 242, 204)'],
    ['E2', '1:4', 'color', 'rgb(192, 0, 0)'],
    ['F2', '1:5', 'text-align', 'center'],
  ]) {
    await select(page, address!, coord!)
    await arm(page)
    await paintByKeyboard(page, 'B10', '9:1')
    await expect(cell(page, '9:1')).toHaveCSS(property!, value!)
    await expect(cell(page, '9:1')).toHaveText('Contoso')
  }
})

test('double click paints multiple targets from one snapshot; Escape stops subsequent clicks', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await arm(page, true)
  for (const coord of ['9:1', '10:1']) {
    await cell(page, coord).click()
    await expect(cell(page, coord)).toHaveCSS('font-style', 'italic')
    await expect(brush(page)).toHaveAttribute('data-painter-mode', 'sticky')
  }
  await page.keyboard.press('Escape')
  await expect(brush(page)).toHaveAttribute('data-painter-mode', 'idle')
  await cell(page, '11:1').click()
  await expect(cell(page, '11:1')).toHaveCSS('font-style', 'normal')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '10:1')).toHaveCSS('font-style', 'normal')
  await expect(cell(page, '9:1')).toHaveCSS('font-style', 'italic')
})

test('clicking the active button cancels without painting or adding history', async ({ page }) => {
  await select(page, 'A2', '1:0')
  await arm(page)
  await brush(page).click()
  await expect(brush(page)).toHaveAttribute('aria-pressed', 'false')
  await cell(page, '9:1').click()
  await expect(cell(page, '9:1')).toHaveCSS('font-weight', '400')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('Escape cancels with focus on another toolbar button or in the name box', async ({ page }) => {
  for (const target of [page.getByRole('button', { name: 'Bold', exact: true }),
    page.getByRole('textbox', { name: 'Name box' })]) {
    await select(page, 'A2', '1:0')
    await arm(page, true)
    await target.focus()
    await target.press('Escape')
    await expect(brush(page)).toHaveAttribute('data-painter-mode', 'idle')
  }
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('format painter does not replace the ordinary clipboard or touch system permissions', async ({ page, context }) => {
  await select(page, 'D3', '2:3')
  await copy(page)
  await context.clearPermissions()
  await select(page, 'A2', '1:0')
  await arm(page)
  await cell(page, '9:1').click()
  await expect(cell(page, '9:1')).toHaveCSS('font-weight', '700')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'C10', '9:2')
  await paste(page)
  await expect(cell(page, '9:2')).toHaveText('Monitor')
  await expect(cell(page, '9:2')).toHaveCSS('font-weight', '400')
})

test('changing the source after capture does not alter the frozen native format', async ({ page }) => {
  await select(page, 'A2', '1:0')
  await arm(page, true)
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '400')
  await cell(page, '9:1').click()
  await expect(cell(page, '9:1')).toHaveCSS('font-weight', '700')
})

test('sheet switch cancels the brush permanently, including switching back', async ({ page }) => {
  await select(page, 'A2', '1:0')
  await arm(page, true)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(brush(page)).toHaveAttribute('data-painter-mode', 'idle')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(brush(page)).toHaveAttribute('data-painter-mode', 'idle')
  await select(page, 'B10', '9:1')
  await cell(page, '9:1').click()
  await expect(cell(page, '9:1')).toHaveCSS('font-weight', '400')
})

test('frozen source and an offscreen target share native formatting', async ({ page }) => {
  await select(page, 'C3', '2:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'A2', '1:0')
  await arm(page)
  await paintByKeyboard(page, 'F900', '899:5')
  await expect(cell(page, '899:5')).toHaveCSS('font-weight', '700')
  await select(page, 'A2', '1:0')
  await expect(await select(page, 'F900', '899:5')).toHaveCSS('font-weight', '700')
})

for (const width of [1280, 390]) {
  test(`mismatched target fails without partial paint and can retry at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await select(page, 'A2:A3', '1:0')
    await arm(page)
    await brush(page).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`painter-ready-${width}.png`) })
    await select(page, 'A10:A12', '9:0')
    await page.locator('[data-workbook-grid]').press('Enter')
    const feedback = page.getByLabel('Format painter status')
    await expect(feedback).toContainText('whole copies')
    await expect(brush(page)).toHaveAttribute('data-painter-mode', 'armed')
    await expect(cell(page, '9:0')).toHaveCSS('font-weight', '400')
    await feedback.scrollIntoViewIfNeeded()
    expect(await feedback.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`painter-error-${width}.png`) })
    await paintByKeyboard(page, 'A10:A13', '9:0')
    await expect(cell(page, '9:0')).toHaveCSS('font-weight', '700')
    await expect(cell(page, '10:0')).toHaveCSS('font-weight', '400')
    expect(errors).toEqual([])
  })
}
