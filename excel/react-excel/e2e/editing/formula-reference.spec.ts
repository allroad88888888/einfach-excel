import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Cell editor', exact: true })
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })

async function destination(page: Page, address = 'B10', coord = '9:1') {
  const target = await select(page, address, coord)
  await page.getByTestId('sheet-scroll').evaluate((node) => { node.scrollTop = 0 })
  await expect(cell(page, '1:0')).toBeVisible()
  return target
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const source of ['cell', 'formula-bar'] as const) {
  test(`${source}: click references, type operators and commit once through Rust`, async ({ page }) => {
    const target = await destination(page)
    if (source === 'cell') await target.dblclick()
    const input = source === 'cell' ? editor(page) : formula(page)
    await input.fill('=')
    await cell(page, '1:4').click()
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('=E2')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B10')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await input.pressSequentially('*')
    await cell(page, '1:5').click()
    await expect(input).toHaveValue('=E2*F2')
    await input.press('Enter')
    await expect(target).toHaveText('79')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveText('Contoso')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(target).toHaveText('79')
    await select(page, 'E2', '1:4')
    await formula(page).fill('2')
    await formula(page).press('Enter')
    await expect(target).toHaveText('158')
  })
}

test('dragging backwards inserts a normalized range and cancel never modifies the workbook', async ({ page }) => {
  const target = await destination(page)
  await target.dblclick()
  await editor(page).fill('=SUM(')
  const start = (await cell(page, '3:5').boundingBox())!
  const end = (await cell(page, '1:4').boundingBox())!
  await page.mouse.move(start.x + 10, start.y + 10)
  await page.mouse.down()
  await page.mouse.move(end.x + 10, end.y + 10, { steps: 5 })
  await expect(editor(page)).toHaveValue('=SUM(E2:F4')
  await expect(page.locator('.formula-reference-outline')).toBeVisible()
  await page.mouse.up()
  await editor(page).pressSequentially(')')
  await editor(page).press('Enter')
  await expect(target).toHaveText('563')
  await target.dblclick()
  await editor(page).fill('=')
  await cell(page, '4:4').click()
  await editor(page).press('Escape')
  await expect(target).toHaveText('563')
  await expect(page.locator('.formula-reference-outline')).toHaveCount(0)
  await target.dblclick()
  await editor(page).fill('=')
  await cell(page, '2:4').click()
  await expect(editor(page)).toHaveValue('=E3')
  await editor(page).press('Enter')
  await expect(target).toHaveText('2')
})

test('F4 cycles locks in both editors and Rust keeps absolute references fixed after copy', async ({ page }) => {
  const target = await destination(page)
  await target.dblclick()
  await editor(page).fill('=')
  await cell(page, '1:4').click()
  for (const expected of ['=$E$2', '=E$2', '=$E2', '=E2', '=$E$2']) {
    await editor(page).press('F4')
    await expect(editor(page)).toHaveValue(expected)
  }
  await editor(page).press('Enter')
  await expect(target).toHaveText('1')
  await select(page, 'B10', '9:1')
  await formula(page).focus()
  await formula(page).press('End')
  await formula(page).press('F4')
  await expect(formula(page)).toHaveValue('=E$2')
  await formula(page).press('F4')
  await formula(page).press('F4')
  await formula(page).press('F4')
  await expect(formula(page)).toHaveValue('=$E$2')
  await formula(page).press('Enter')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toContainText('Copied')
  await select(page, 'B11', '10:1')
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(cell(page, '10:1')).toHaveText('1')
  await expect(formula(page)).toHaveValue('=$E$2')
})

test('F4 does not rewrite cell-like text inside a string or a function name', async ({ page }) => {
  await select(page, 'B10', '9:1')
  await formula(page).fill('="A1"')
  await formula(page).evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(3, 3))
  await formula(page).press('F4')
  await expect(formula(page)).toHaveValue('="A1"')
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('A1')
})

for (const width of [1280, 390]) {
  test(`reference picking remains focused and visible at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    const target = await destination(page, 'A10', '9:0')
    await target.dblclick()
    await editor(page).fill('=')
    await cell(page, '1:0').click()
    await expect(editor(page)).toHaveValue('=A2')
    await expect(editor(page)).toBeFocused()
    await expect(page.locator('.formula-reference-outline')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`formula-reference-${width}.png`) })
    await editor(page).press('Enter')
    await expect(target).toHaveText('SO-10001')
  })
}
