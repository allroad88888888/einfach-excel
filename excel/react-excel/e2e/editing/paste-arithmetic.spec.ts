import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste, pasteOption } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const [operation, result] of [
  ['add', '12'],
  ['subtract', '6'],
  ['multiply', '27'],
] as const) {
  test(`${operation} combines seed numbers and undo restores the entire operation`, async ({
    page,
  }) => {
    await select(page, 'E4', '3:4')
    await expect(formula(page)).toHaveValue('3')
    await copy(page)
    await select(page, 'E10', '9:4')
    await expect(formula(page)).toHaveValue('9')
    await pasteOption(page, operation)
    await expect(cell(page, '9:4')).toHaveText(result)
    await expect(formula(page)).toHaveValue(result)
    await expect(page.getByRole('combobox', { name: 'More paste options' })).toHaveValue('')
    await button(page, 'Undo').click()
    await expect(cell(page, '9:4')).toHaveText('9')
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, '9:4')).toHaveText(result)
    await select(page, 'A800', '799:0')
    await expect(await select(page, 'E10', '9:4')).toHaveText(result)
    // 运算是一次性命令，后续普通 Paste 仍是覆盖，不重复做运算。
    await paste(page)
    await expect(cell(page, '9:4')).toHaveText('3')
  })
}

test('formula paste shifts source references and preserves both live expressions', async ({
  page,
}) => {
  await select(page, 'G2', '1:6')
  await copy(page)
  await select(page, 'G3', '2:6')
  await pasteOption(page, 'add')
  await expect(cell(page, '2:6')).toHaveText('1316')
  await expect(formula(page)).toHaveValue('=((E3*F3)+(E3*F3))')
  await select(page, 'E3', '2:4')
  await formula(page).fill('4')
  await formula(page).press('Enter')
  await expect(cell(page, '2:6')).toHaveText('2632')
  await button(page, 'Undo').click()
  await expect(cell(page, '2:6')).toHaveText('1316')
  await button(page, 'Undo').click()
  await expect(cell(page, '2:6')).toHaveText('658')
  await select(page, 'G3', '2:6')
  await expect(formula(page)).toHaveValue('=E3*F3')
})

test('source style is pasted and undo restores the target style for the whole selection', async ({
  page,
}) => {
  await select(page, 'E2', '1:4')
  await copy(page)
  await select(page, 'E4:E6', '3:4')
  await pasteOption(page, 'add')
  for (const [coord, value] of [
    ['3:4', '4'],
    ['4:4', '5'],
    ['5:4', '6'],
  ] as const) {
    await expect(cell(page, coord)).toHaveText(value)
    await expect(cell(page, coord)).toHaveCSS('color', 'rgb(192, 0, 0)')
  }
  await button(page, 'Undo').click()
  await expect(cell(page, '3:4')).toHaveText('3')
  await expect(cell(page, '4:4')).toHaveText('4')
  await expect(cell(page, '5:4')).toHaveText('5')
  await expect(cell(page, '3:4')).not.toHaveCSS('color', 'rgb(192, 0, 0)')
})

test('external TSV tiles arithmetic while preserving target format and recalculating totals', async ({
  page,
}) => {
  await page.evaluate(() => navigator.clipboard.writeText('2'))
  await select(page, 'E2:E4', '1:4')
  await pasteOption(page, 'multiply')
  await expect(cell(page, '1:4')).toHaveText('2')
  await expect(cell(page, '2:4')).toHaveText('4')
  await expect(cell(page, '3:4')).toHaveText('6')
  await expect(cell(page, '1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
  await expect(cell(page, '1:6')).toHaveText('158')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('158')
  await button(page, 'Undo').click()
  await expect(cell(page, '0:1')).toHaveText('79')
})

test('rejected cut arithmetic leaves both sides intact and a normal move still works', async ({
  page,
}) => {
  await select(page, 'E4', '3:4')
  await copy(page, 'Cut')
  await select(page, 'E10', '9:4')
  await page.getByRole('combobox', { name: 'More paste options' }).selectOption('multiply')
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toHaveText(
    'Paste special requires Copy, not Cut. The cut cells are unchanged.',
  )
  await expect(await select(page, 'E4', '3:4')).toHaveText('3')
  await expect(await select(page, 'E10', '9:4')).toHaveText('9')
  await expect(button(page, 'Undo')).toBeDisabled()
  await paste(page)
  await expect(cell(page, '9:4')).toHaveText('3')
  await expect(await select(page, 'E4', '3:4')).toHaveText('')
})

test('arithmetic errors are real cell errors and undo restores the original text', async ({
  page,
}) => {
  await page.evaluate(() => navigator.clipboard.writeText('2'))
  await select(page, 'B4', '3:1')
  await pasteOption(page, 'multiply')
  await expect(cell(page, '3:1')).toHaveText('#VALUE!')
  await button(page, 'Undo').click()
  await expect(cell(page, '3:1')).toHaveText('Contoso')
})

test('quoted literal text cannot become executable syntax when combined with a formula', async ({
  page,
}) => {
  const target = await select(page, 'G4', '3:6')
  await formula(page).fill('\")+7+(\"')
  await formula(page).press('Enter')
  await expect(target).toHaveText('\")+7+(\"')
  await select(page, 'G2', '1:6')
  await copy(page)
  await select(page, 'G4', '3:6')
  await pasteOption(page, 'add')
  await expect(target).toHaveText('#VALUE!')
  await button(page, 'Undo').click()
  await expect(target).toHaveText('\")+7+(\"')
})

test('desktop and narrow screens expose arithmetic actions and the history label', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.reload()
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.evaluate(() => navigator.clipboard.writeText('2'))
    await select(page, 'E4', '3:4')
    const menu = page.getByRole('combobox', { name: 'More paste options' })
    await menu.scrollIntoViewIfNeeded()
    for (const label of ['Paste and add', 'Paste and subtract', 'Paste and multiply'])
      await expect(menu.getByRole('option', { name: label })).toHaveCount(1)
    expect(
      await menu.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el
      }),
    ).toBe(true)
    await pasteOption(page, 'subtract')
    await expect(cell(page, '3:4')).toHaveText('1')
    await button(page, 'Recent operations').scrollIntoViewIfNeeded()
    await button(page, 'Recent operations').click()
    const dialog = page.getByRole('dialog', { name: 'Recent operations' })
    await expect(dialog).toContainText('Paste and subtract')
    await expect(dialog).toBeInViewport()
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(button(page, 'Close history')).toBeFocused()
    await page.screenshot({ path: info.outputPath(`paste-arithmetic-${width}.png`) })
    await button(page, 'Close history').click()
  }
  expect(errors).toEqual([])
})
