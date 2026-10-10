import { expect, test, type Page } from '@playwright/test'
import { select, paste, copy } from '../support/clipboard'

const examples = [
  { input: '13:30', display: '13:30', raw: '0.5625', doubled: '1.125' },
  { input: '1:30 PM', display: '1:30 PM', raw: '0.5625', doubled: '1.125' },
  { input: '1 1/2', display: '1 1/2', raw: '1.5', doubled: '3' },
]
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function enter(page: Page, address: string, coord: string, input: string, display: string) {
  const cell = await select(page, address, coord)
  await formula(page).fill(input)
  await formula(page).press('Enter')
  await expect(cell).toHaveText(display)
  return cell
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const source of ['cell', 'formula'] as const) {
  for (const sample of examples) {
    test(`${source}: ${sample.input} becomes a native number, re-edits and calculates`, async ({ page }) => {
      const cell = await select(page, 'B10', '9:1')
      await page.getByRole('button', { name: 'Bold', exact: true }).click()
      await expect(cell).toHaveCSS('font-weight', '700')
      if (source === 'cell') await cell.dblclick()
      const editor = source === 'cell' ? page.getByRole('textbox', { name: 'Cell editor' }) : formula(page)
      await editor.fill(sample.input)
      await editor.press('Enter')
      if (source === 'cell') await expect(editor).toBeHidden()
      await expect(cell).toHaveText(sample.display)
      await expect(cell).toHaveCSS('font-weight', '700')
      await enter(page, 'C10', '9:2', '=B10*2', sample.doubled)
      await select(page, 'B10', '9:1')
      await expect(formula(page)).toHaveValue(sample.raw)
      await cell.dblclick()
      const reopened = page.getByRole('textbox', { name: 'Cell editor' })
      await expect(reopened).toHaveValue(sample.raw)
      await reopened.press('Enter')
      await expect(reopened).toBeHidden()
      await expect(cell).toHaveText(sample.display)
      await select(page, 'A800', '799:0')
      await expect(await select(page, 'B10', '9:1')).toHaveText(sample.display)
      await page.getByRole('tab', { name: 'Summary', exact: true }).click()
      await expect(page.locator('td[data-cell="0:0"]')).toHaveText('First order total')
      await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
      await expect(await select(page, 'B10', '9:1')).toHaveText(sample.display)
    })
  }
}

for (const sample of examples) {
  test(`${sample.input}: one undo restores both value and previous format; copy carries both`, async ({ page }) => {
    const cell = await enter(page, 'B10', '9:1', '12.50%', '12.50%')
    await enter(page, 'B10', '9:1', sample.input, sample.display)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell).toHaveText('12.50%')
    await select(page, 'B10', '9:1')
    await expect(formula(page)).toHaveValue('0.125')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell).toHaveText(sample.display)
    await select(page, 'B10', '9:1')
    await expect(formula(page)).toHaveValue(sample.raw)
    await copy(page)
    await select(page, 'D10', '9:3')
    await paste(page)
    await expect(page.locator('td[data-cell="9:3"]')).toHaveText(sample.display)
    await expect(formula(page)).toHaveValue(sample.raw)
  })
}

test('elapsed hours, noon, midnight and negative fractions keep numeric semantics', async ({ page }) => {
  for (const [input, display, raw] of [
    ['36:00:00', '36:00:00', '1.5'],
    ['12 AM', '12:00 AM', '0'],
    ['12:00 PM', '12:00 PM', '0.5'],
    ['9 a', '9:00 AM', '0.375'],
    ['-0 2/8', '-2/8', '-0.25'],
  ]) {
    await enter(page, 'B10', '9:1', input!, display!)
    await select(page, 'B10', '9:1')
    await expect(formula(page)).toHaveValue(raw!)
  }
})

test('ambiguous, invalid and forced text remains text through reopening', async ({ page }) => {
  for (const input of ['1/2', '1 1/0', '13:60', '13:00 PM', "'13:30", "'1 1/2"]) {
    const display = input.startsWith("'") ? input.slice(1) : input
    const cell = await enter(page, 'B10', '9:1', input, display)
    await enter(page, 'C10', '9:2', '=ISTEXT(B10)', 'TRUE')
    await select(page, 'B10', '9:1')
    await expect(formula(page)).toHaveValue(input)
    await cell.dblclick()
    const editor = page.getByRole('textbox', { name: 'Cell editor' })
    await expect(editor).toHaveValue(input)
    await editor.press('Enter')
    await expect(editor).toBeHidden()
    await expect(cell).toHaveText(display)
  }
})

test('external TSV parses all three inputs but retains destination formatting', async ({ page }) => {
  await enter(page, 'B10', '9:1', '25%', '25%')
  await page.evaluate(() => navigator.clipboard.writeText("12:00\t12:00 PM\t1 1/2\t'1 1/2"))
  await select(page, 'B10', '9:1')
  await paste(page)
  for (const [coord, display] of [['9:1', '50%'], ['9:2', '0.5'], ['9:3', '1.5'], ['9:4', '1 1/2']]) {
    await expect(page.locator(`td[data-cell="${coord}"]`)).toHaveText(display!)
  }
  await enter(page, 'B11', '10:1', '=SUM(B10:D10)', '2.5')
})

test('time and fraction seed examples use native formats without creating history', async ({ page }) => {
  for (const [address, coord, display] of [
    ['O15', '14:14', '3:36'], ['O16', '15:14', '4:48 AM'], ['O18', '17:14', '1/20'],
  ]) {
    await expect(await select(page, address!, coord!)).toHaveText(display!)
  }
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
