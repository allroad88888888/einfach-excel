import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const source of ['cell', 'formula-bar']) {
  test(`${source}: arrows and Shift build a formula, F4 locks survive, and one undo restores the cell`, async ({
    page,
  }) => {
    const target = await select(page, 'G2', '1:6')
    if (source === 'cell') await target.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value',
      exact: true,
    })
    await input.fill('=SUM(')
    await input.press('ArrowLeft')
    await input.press('ArrowLeft')
    await expect(input).toHaveValue('=SUM(E2')
    await input.press('F4')
    await input.press('Shift+ArrowDown')
    await input.press('Shift+ArrowDown')
    await expect(input).toHaveValue('=SUM($E$2:$E$4')
    await expect(input).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('G2')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await input.pressSequentially(')')
    await input.press('Enter')
    await expect(target).toHaveText('6')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveText('79')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(target).toHaveText('6')
  })
}

test('F2 switches actual DOM caret movement and resumes the existing reference without duplicating it', async ({
  page,
}) => {
  const target = await select(page, 'G2', '1:6')
  await target.dblclick()
  const input = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await input.fill('=SUM(')
  await input.press('F2')
  await input.press('ArrowLeft')
  expect(await input.evaluate((node: HTMLTextAreaElement) => node.selectionStart)).toBe(4)
  await expect(input).toHaveValue('=SUM(')
  await input.press('ArrowRight')
  await input.press('F2')
  await input.press('ArrowLeft')
  await input.press('ArrowLeft')
  await expect(input).toHaveValue('=SUM(E2')
  await input.press('F2')
  await input.press('ArrowLeft')
  expect(await input.evaluate((node: HTMLTextAreaElement) => node.selectionStart)).toBe(6)
  await input.press('F2')
  await input.press('ArrowDown')
  await expect(input).toHaveValue('=SUM(E3')
  await input.pressSequentially(')')
  await input.press('Enter')
  await expect(target).toHaveText('2')
})

test('keyboard references skip real hidden rows and columns', async ({ page }) => {
  const menu = page.getByRole('combobox', { name: 'Row and column visibility' })
  await select(page, 'A3', '2:0')
  await menu.selectOption('hide-rows')
  await expect(menu).toHaveValue('')
  await select(page, 'F2', '1:5')
  await menu.selectOption('hide-columns')
  await expect(menu).toHaveValue('')
  const target = await select(page, 'G2', '1:6')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill('=')
  await input.press('ArrowLeft')
  await input.press('ArrowDown')
  await expect(input).toHaveValue('=E4')
  await input.press('Enter')
  await expect(target).toHaveText('3')
})

test('merged cells are one reference stop and the next arrow exits the whole merge', async ({
  page,
}) => {
  await select(page, 'B2:C3', '1:1')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Merge cells', exact: true })
    .click()
  await expect(page.locator('[data-merged-cell][data-cell="1:1"]')).toBeVisible()
  const expected = await page.locator('td[data-cell="3:1"]').textContent()
  const target = await select(page, 'D2', '1:3')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill('=')
  await input.press('ArrowLeft')
  await expect(input).toHaveValue('=B2')
  await input.press('ArrowDown')
  await expect(input).toHaveValue('=B4')
  await input.press('Enter')
  await expect(target).toHaveText(expected!)
})

for (const width of [1280, 390]) {
  test(`Shift references scroll both axes below frozen headers at ${width}px without moving the edit source`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 800 })
    await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('first-row')
    await select(page, 'B2', '1:1')
    const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await input.fill('=SUM(')
    for (let i = 0; i < 3; i++) await input.press('ArrowRight')
    for (let i = 0; i < 40; i++) await input.press('Shift+ArrowDown')
    await expect(input).toHaveValue('=SUM(E2:E42')
    for (let i = 0; i < 11; i++) await input.press('Shift+ArrowRight')
    await expect(input).toHaveValue('=SUM(E2:P42')
    const scroll = page.getByTestId('sheet-scroll')
    expect(await scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(200)
    expect(await scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(200)
    await expect(page.locator('td[data-cell="41:15"]')).toBeInViewport()
    await expect(input).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`keyboard-reference-${width}.png`) })
    await input.press('Escape')
    const target = await select(page, 'B2', '1:1')
    await expect(target).toHaveText('Acme Co.')
  })
}

test('last-cell arrows stay inside the sheet and a new edit resets F2 text mode', async ({
  page,
}) => {
  const target = await select(page, 'P1001', '1000:15')
  await target.dblclick()
  const input = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await input.fill('=')
  await input.press('ArrowDown')
  await input.press('ArrowRight')
  await expect(input).toHaveValue('=P1001')
  await input.press('F2')
  await input.press('Escape')
  await target.dblclick()
  await input.fill('=')
  await input.press('ArrowUp')
  await expect(input).toHaveValue('=P1000')
  await input.press('Escape')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('an in-cell editor keeps its draft and commits to the original cell after both axes scroll away', async ({
  page,
}) => {
  await (await select(page, 'B2', '1:1')).dblclick()
  const input = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await input.fill('=COUNTA(')
  for (let i = 0; i < 3; i++) await input.press('ArrowRight')
  for (let i = 0; i < 40; i++) await input.press('Shift+ArrowDown')
  for (let i = 0; i < 11; i++) await input.press('Shift+ArrowRight')
  await expect(input).toHaveValue('=COUNTA(E2:P42')
  await expect(input).toBeFocused()
  await expect(page.locator('td[data-cell="41:15"]')).toBeInViewport()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
  await input.pressSequentially(')')
  await input.press('Enter')
  await expect(input).toHaveCount(0)
  const target = await select(page, 'B2', '1:1')
  await expect(target).toHaveText('492')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target).toHaveText('Acme Co.')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('a delayed native formula commit leaves a newly focused name-box draft alone', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Object.defineProperty(window, 'releaseCellEdit', { value: () => release() })
    Worker.prototype.postMessage = function (
      message: { command?: string },
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () =>
        post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'cell.setInput') release = send
      else send()
    }
  })
  await page.reload()
  await (await select(page, 'B2', '1:1')).dblclick()
  const input = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await input.fill('=SUM(1,2)')
  await input.press('Enter')
  await expect(input).toBeDisabled()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('B10')
  await page.evaluate(() => Reflect.get(window, 'releaseCellEdit')())
  await expect(input).toHaveCount(0)
  await expect(name).toBeFocused()
  await expect(name).toHaveValue('B10')
  await name.press('Enter')
  await expect(page.locator('td[data-cell="9:1"]')).toBeVisible()
  await expect(name).toHaveValue('B10')
  await expect(await select(page, 'B2', '1:1')).toHaveText('3')
})
