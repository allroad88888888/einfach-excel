import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Cell editor', exact: true })

async function switchTo(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  await expect(formula(page)).toBeFocused()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const source of ['cell', 'formula-bar'] as const) {
  test(`${source}: cross-sheet click writes original cell once and supports undo/redo`, async ({ page }) => {
    const target = await select(page, 'B10', '9:1')
    if (source === 'cell') await target.dblclick()
    await (source === 'cell' ? editor(page) : formula(page)).fill('=')
    await switchTo(page, 'Summary')
    await expect(editor(page)).toHaveCount(0)
    await expect(formula(page)).toHaveValue('=')
    await expect(cell(page, '0:1')).toHaveText('79')
    await cell(page, '0:1').click()
    await expect(formula(page)).toHaveValue("='Summary'!B1")
    await expect(formula(page)).toBeFocused()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Delete sheet' })).toBeDisabled()
    await formula(page).press('Enter')
    await expect(page.getByRole('tab', { name: 'Sales Orders' })).toHaveAttribute('aria-selected', 'true')
    await expect(cell(page, '9:1')).toHaveText('79')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B10')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '9:1')).toHaveText('Contoso')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '9:1')).toHaveText('79')
  })
}

test('cross-sheet backwards drag creates a range and native recalculation follows source data', async ({ page }) => {
  await select(page, 'B10', '9:1')
  await formula(page).fill('=SUM(')
  await switchTo(page, 'Summary')
  const start = (await cell(page, '1:1').boundingBox())!
  const end = (await cell(page, '0:1').boundingBox())!
  await page.mouse.move(start.x + 10, start.y + 10)
  await page.mouse.down()
  await page.mouse.move(end.x + 10, end.y + 10, { steps: 5 })
  await page.mouse.up()
  await expect(formula(page)).toHaveValue("=SUM('Summary'!B1:B2")
  await expect(page.locator('.formula-reference-outline').first()).toBeVisible()
  await formula(page).pressSequentially(')')
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('79')
  await select(page, 'E2', '1:4')
  await formula(page).fill('2')
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('158')
})

test('cross-sheet keyboard references retain F4 locks through Shift and F2', async ({ page }) => {
  await select(page, 'B10', '9:1')
  await formula(page).fill('=SUM(')
  await switchTo(page, 'Summary')
  await formula(page).press('ArrowRight')
  await expect(formula(page)).toHaveValue("=SUM('Summary'!B1")
  await formula(page).press('F4')
  await formula(page).press('Shift+ArrowDown')
  await expect(formula(page)).toHaveValue("=SUM('Summary'!$B$1:$B$2")
  await formula(page).press('F2')
  await formula(page).press('ArrowLeft')
  await expect(formula(page)).toHaveValue("=SUM('Summary'!$B$1:$B$2")
  await formula(page).press('F2')
  await formula(page).press('Shift+ArrowUp')
  await expect(formula(page)).toHaveValue("=SUM('Summary'!$B$1")
  await formula(page).pressSequentially(')')
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('79')
})

test('sheet names with spaces, apostrophes and Chinese survive native parsing and mixed references', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await page.getByRole('button', { name: 'Rename sheet' }).click()
  const name = page.getByRole('textbox', { name: 'Sheet name', exact: true })
  await name.fill("O'Brien 预算")
  await name.press('Enter')
  await expect(page.getByRole('tab', { name: "O'Brien 预算", exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'B10', '9:1')
  await formula(page).fill('=')
  await switchTo(page, "O'Brien 预算")
  await cell(page, '0:1').click()
  await expect(formula(page)).toHaveValue("='O''Brien 预算'!B1")
  await formula(page).pressSequentially('+')
  await switchTo(page, 'Sales Orders')
  // 引用浏览也从原视图开始；E2 在已记住的 B10 上方，先把它滚入窗口。
  await page.getByTestId('sheet-scroll').evaluate((element) => {
    element.scrollTop = 0
    element.scrollLeft = 0
  })
  await cell(page, '1:4').click()
  await expect(formula(page)).toHaveValue("='O''Brien 预算'!B1+E2")
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('80')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B10')
})

test('F2 reopens an existing cross-sheet reference and saves into the original cell', async ({ page }) => {
  await select(page, 'B10', '9:1')
  await formula(page).fill("='Summary'!B1")
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('79')
  await cell(page, '9:1').dblclick()
  await editor(page).press('ArrowRight')
  await expect.poll(() => editor(page).evaluate((input: HTMLTextAreaElement) =>
    [input.selectionStart, input.selectionEnd])).toEqual([13, 13])
  await editor(page).press('F2')
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
  await expect(formula(page)).toBeFocused()
  await formula(page).press('ArrowDown')
  await expect(formula(page)).toHaveValue("='Summary'!B2")
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('Acme Co.')
})

test('clicking a third sheet after finishing the formula saves once and honors that tab', async ({ page }) => {
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Sales Orders' }).click()
  await select(page, 'B10', '9:1')
  await formula(page).fill('=SUM(')
  await switchTo(page, 'Summary')
  await cell(page, '0:1').click()
  await formula(page).pressSequentially(')')
  await page.getByRole('tab', { name: 'Sheet3' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await expect(cell(page, '0:0')).toHaveText('')
  await page.getByRole('tab', { name: 'Sales Orders' }).click()
  await expect(cell(page, '9:1')).toHaveText('79')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '9:1')).toHaveText('Contoso')
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toBeVisible()
})

test('native rejection retains the cross-sheet draft and lets the user correct it', async ({ page }) => {
  await select(page, 'B10', '9:1')
  await formula(page).fill('=SUM(')
  await switchTo(page, 'Summary')
  await cell(page, '0:1').click()
  await formula(page).press('Enter')
  await expect(page.getByRole('alert')).toContainText('not saved')
  await expect(formula(page)).toHaveValue("=SUM('Summary'!B1")
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
  await formula(page).pressSequentially(')')
  await formula(page).press('Enter')
  await expect(cell(page, '9:1')).toHaveText('79')
})

test('pending native cross-sheet write disables tabs and returns the offscreen source after acknowledgement', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Object.defineProperty(window, 'releaseCrossEdit', { value: () => release() })
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
  await select(page, 'P1001', '1000:15')
  await formula(page).fill('=')
  await switchTo(page, 'Summary')
  await cell(page, '0:1').click()
  await formula(page).press('Enter')
  await expect(formula(page)).toBeDisabled()
  await expect(page.getByRole('tab', { name: 'Sales Orders' })).toBeDisabled()
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeDisabled()
  await page.evaluate(() => Reflect.get(window, 'releaseCrossEdit')())
  await expect(cell(page, '1000:15')).toBeInViewport()
  await expect(cell(page, '1000:15')).toHaveText('79')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('P1001')
})

for (const width of [1280, 390]) {
  test(`cross-sheet pick keeps formula visible and cancel returns offscreen source at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    const target = await select(page, 'P1001', '1000:15')
    const original = await target.innerText()
    await target.dblclick()
    await editor(page).fill('=')
    await switchTo(page, 'Summary')
    await cell(page, '0:0').click()
    await expect(formula(page)).toHaveValue("='Summary'!A1")
    await expect(formula(page)).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`cross-sheet-${width}.png`) })
    await formula(page).press('Escape')
    await expect(cell(page, '1000:15')).toBeVisible()
    await expect(cell(page, '1000:15')).toHaveText(original)
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('P1001')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
