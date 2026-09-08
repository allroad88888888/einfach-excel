import { expect, test, type Page } from '@playwright/test'
import { select, paste } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

/** 等待提交后的格子显示，避免把异步保存当成下一次编辑。 */
async function enter(page: Page, address: string, coord: string, value: string, display: string) {
  const cell = await select(page, address, coord)
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill(value)
  await formula.press('Enter')
  await expect(cell).toHaveText(display)
  return cell
}

for (const source of ['cell', 'formula'] as const) {
  test(`${source} preserves forced text through re-editing and formula references`, async ({
    page,
  }) => {
    const cell = await select(page, 'B10', '9:1')
    if (source === 'cell') await cell.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value',
    })
    await input.fill("'00123")
    await input.press('Enter')
    if (source === 'cell') await expect(input).toBeHidden()
    await expect(cell).toHaveText('00123')
    await select(page, 'B10', '9:1')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue("'00123")
    await cell.dblclick()
    const editor = page.getByRole('textbox', { name: 'Cell editor' })
    await expect(editor).toHaveValue("'00123")
    await editor.press('Enter')
    await expect(editor).toBeHidden()
    await enter(page, 'C10', '9:2', '=ISTEXT(B10)', 'TRUE')
    await select(page, 'A800', '799:0')
    await expect(await select(page, 'B10', '9:1')).toHaveText('00123')
  })

  test(`${source} installs a Boolean and recalculates its dependent formula`, async ({ page }) => {
    const cell = await select(page, 'B10', '9:1')
    if (source === 'cell') await cell.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value',
    })
    await input.fill(' FaLsE ')
    await input.press('Enter')
    if (source === 'cell') await expect(input).toBeHidden()
    await expect(cell).toHaveText('FALSE')
    await enter(page, 'C10', '9:2', '=ISLOGICAL(B10)', 'TRUE')
    const dependent = await enter(page, 'D10', '9:3', '=IF(B10,11,22)', '22')
    await enter(page, 'B10', '9:1', 'true', 'TRUE')
    await expect(dependent).toHaveText('11')
    await select(page, 'A800', '799:0')
    await expect(await select(page, 'B10', '9:1')).toHaveText('TRUE')
  })

  test(`${source} stores a percentage as a number and changes only its number format`, async ({
    page,
  }) => {
    const cell = await select(page, 'B10', '9:1')
    await page.getByRole('button', { name: 'Bold', exact: true }).click()
    await expect(cell).toHaveCSS('font-weight', '700')
    if (source === 'cell') await cell.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value',
    })
    await input.fill('12.50%')
    await input.press('Enter')
    if (source === 'cell') await expect(input).toBeHidden()
    await expect(cell).toHaveText('12.50%')
    await expect(cell).toHaveCSS('font-weight', '700')
    await select(page, 'B10', '9:1')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('0.125')
    await cell.dblclick()
    const editor = page.getByRole('textbox', { name: 'Cell editor' })
    await expect(editor).toHaveValue('0.125')
    await editor.press('Enter')
    await expect(editor).toBeHidden()
    await enter(page, 'C10', '9:2', '=B10*100', '12.5')
    await select(page, 'A800', '799:0')
    await expect(await select(page, 'B10', '9:1')).toHaveText('12.50%')
  })
}

test('the apostrophe escapes formula-looking and empty text without storing the marker', async ({
  page,
}) => {
  await enter(page, 'B10', '9:1', "'=1+2", '=1+2')
  await enter(page, 'C10', '9:2', '=ISTEXT(B10)', 'TRUE')
  await enter(page, 'B10', '9:1', "'", '')
  await expect(page.locator('td[data-cell="9:2"]')).toHaveText('TRUE')
  await select(page, 'A800', '799:0')
  await select(page, 'B10', '9:1')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue("'")
})

test('failed formulas preserve the original native value after cancelling the draft', async ({
  page,
}, info) => {
  await enter(page, 'B10', '9:1', '7', '7')
  await enter(page, 'C10', '9:2', '=B10*2', '14')
  for (const invalid of ['=SUM(', '=C10']) {
    await select(page, 'B10', '9:1')
    const formula = page.getByRole('textbox', { name: 'Active cell value' })
    await formula.fill(invalid)
    await formula.press('Enter')
    await expect(page.getByRole('alert')).toContainText('That edit was not saved.')
    await expect(formula).toHaveValue(invalid)
    await expect(formula).toHaveAttribute('aria-invalid', 'true')
    await expect(formula).toHaveAccessibleDescription('That edit was not saved.')
    if (invalid === '=SUM(')
      await page.screenshot({ path: info.outputPath('formula-error-desktop.png') })
    await formula.press('Escape')
    await select(page, 'A800', '799:0')
    await expect(await select(page, 'B10', '9:1')).toHaveText('7')
    await expect(page.locator('td[data-cell="9:2"]')).toHaveText('14')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await select(page, 'A4', '3:0')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('=SUM(')
  await formula.press('Enter')
  const error = page.getByRole('alert')
  await expect(error).toHaveText('That edit was not saved.')
  await expect(error).toBeInViewport()
  expect(await error.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('formula-error-narrow.png') })
})

test('external TSV shares input types but preserves the destination number format', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(() => navigator.clipboard.writeText("'00123\tfalse\t12.5%"))
  await select(page, 'B10', '9:1')
  await paste(page)
  await expect(page.locator('td[data-cell="9:1"]')).toHaveText('00123')
  await expect(page.locator('td[data-cell="9:2"]')).toHaveText('FALSE')
  await expect(page.locator('td[data-cell="9:3"]')).toHaveText('0.125')
  await enter(page, 'B11', '10:1', '=ISTEXT(B10)', 'TRUE')
  await enter(page, 'C11', '10:2', '=ISLOGICAL(C10)', 'TRUE')
  await enter(page, 'D11', '10:3', '=ISNUMBER(D10)', 'TRUE')
})

test('typed seed examples and input text are visible on desktop and narrow screens', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(await select(page, 'H4', '3:7')).toHaveText('TRUE')
  await expect(await select(page, 'O4', '3:14')).toHaveText('10.00%')
  await expect(await select(page, 'A4', '3:0')).toHaveText('00123')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await expect(formula).toHaveValue("'00123")
  await page.screenshot({ path: info.outputPath('typed-input-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await select(page, 'A4', '3:0')
  await expect(formula).toHaveValue("'00123")
  await expect(formula).toBeInViewport()
  expect(await formula.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('typed-input-narrow.png') })
  expect(errors).toEqual([])
})
