import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function choose(page: Page, label: string, value: string) {
  const control = page.getByRole('combobox', { name: label, exact: true })
  await control.selectOption(value)
  await expect(control).toBeEnabled()
  await expect(control).toHaveValue(value)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('native seed values select the matching alignment and rotation controls', async ({ page }) => {
  await select(page, 'F2', '1:5')
  await expect(page.getByRole('combobox', { name: 'Horizontal alignment' })).toHaveValue('center')
  await select(page, 'J2', '1:9')
  await expect(page.getByRole('combobox', { name: 'Vertical alignment' })).toHaveValue('top')
  await select(page, 'K2', '1:10')
  await expect(page.getByRole('combobox', { name: 'Text rotation' })).toHaveValue('45')
})

test('automatic alignment uses native types and explicit alignment remains undoable', async ({ page }) => {
  await select(page, 'B3:E3', '2:1')
  await choose(page, 'Horizontal alignment', 'right')
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'right')
  await choose(page, 'Horizontal alignment', 'default')
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'left')
  await expect(cell(page, '2:4')).toHaveCSS('text-align', 'right')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'right')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'left')
  await select(page, 'B3', '2:1')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('TRUE')
  await formula.press('Enter')
  await expect(cell(page, '2:1')).toHaveText('TRUE')
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'center')
  await select(page, 'B3', '2:1')
  await formula.fill('=1/0')
  await formula.press('Enter')
  await expect(cell(page, '2:1')).toHaveText('#DIV/0!')
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'center')
})

test('row and column alignment obey last-write rules and cell default masks inheritance', async ({ page }) => {
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await choose(page, 'Horizontal alignment', 'center')
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await choose(page, 'Horizontal alignment', 'right')
  await expect(cell(page, '1:1')).toHaveCSS('text-align', 'right')
  await expect(cell(page, '1:0')).toHaveCSS('text-align', 'center')
  await choose(page, 'Vertical alignment', 'top')
  await select(page, 'B2', '1:1')
  await choose(page, 'Horizontal alignment', 'default')
  await choose(page, 'Vertical alignment', 'default')
  await expect(cell(page, '1:1')).toHaveCSS('text-align', 'left')
  await expect(cell(page, '1:1')).toHaveCSS('vertical-align', 'bottom')
  await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '2:1')).toHaveCSS('vertical-align', 'top')
  await select(page, 'B1001', '1000:1')
  await expect(cell(page, '1000:1')).toHaveCSS('text-align', 'right')
  await expect(cell(page, '1000:1')).toHaveCSS('vertical-align', 'top')
})

test('rotation presets and upright vertical text leave row height, width and contents intact', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Row height' }).fill('180')
  await page.getByRole('button', { name: 'Set row height' }).click()
  const target = cell(page, '2:1')
  await expect(target).toHaveCSS('height', '180px')
  const before = await target.boundingBox()
  for (const degrees of [-90, -45, 45, 90]) {
    await choose(page, 'Text rotation', String(degrees))
    await expect(target.locator('.cell-rotated-text')).toHaveAttribute('style',
      new RegExp(`rotate\\(${degrees}deg\\)`))
  }
  await choose(page, 'Text rotation', 'vertical')
  const text = target.locator('.cell-rotated-text')
  await expect(text).toHaveCSS('writing-mode', 'vertical-rl')
  await expect(text).toHaveCSS('text-orientation', 'upright')
  const rect = await text.boundingBox()
  expect(rect!.height).toBeGreaterThan(rect!.width)
  await choose(page, 'Text rotation', '0')
  await expect(target.locator('.cell-rotated-text')).toHaveCount(0)
  await expect(target).toHaveText('Northwind')
  const after = await target.boundingBox()
  expect(after?.width).toBe(before?.width)
  expect(after?.height).toBe(before?.height)
})

test('pending native layout disables all three choices and makes one undo entry', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Object.defineProperty(window, 'releaseLayoutWrite', { value: () => release() })
    Worker.prototype.postMessage = function (
      message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () => post.call(this, message,
        Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (message.command === 'format.setRange') release = send
      else send()
    }
  })
  await page.reload()
  await select(page, 'P1001', '1000:15')
  await page.getByRole('combobox', { name: 'Horizontal alignment' }).focus()
  await page.getByRole('combobox', { name: 'Horizontal alignment' }).selectOption('center')
  for (const name of ['Horizontal alignment', 'Vertical alignment', 'Text rotation'])
    await expect(page.getByRole('combobox', { name })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Applying layout' })).toBeVisible()
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.focus()
  await page.evaluate(() => Reflect.get(window, 'releaseLayoutWrite')())
  await expect(cell(page, '1000:15')).toHaveCSS('text-align', 'center')
  await expect(nameBox).toBeFocused()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1000:15')).toHaveCSS('text-align', 'right')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('editing disables layout controls without committing or losing the draft', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await cell(page, '2:1').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Unsaved')
  for (const name of ['Horizontal alignment', 'Vertical alignment', 'Text rotation'])
    await expect(page.getByRole('combobox', { name })).toBeDisabled()
  await editor.press('Escape')
  await expect(cell(page, '2:1')).toHaveText('Northwind')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('Unsaved formula-bar draft')
  for (const name of ['Horizontal alignment', 'Vertical alignment', 'Text rotation'])
    await expect(page.getByRole('combobox', { name })).toBeDisabled()
  await formula.press('Escape')
  await expect(cell(page, '2:1')).toHaveText('Northwind')
})

test('native rejection is visible and a retry creates only one undo entry', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let rejectOnce = true
    Worker.prototype.postMessage = function (
      message: { command?: string; payload?: { request: { sheetId: string } } },
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (rejectOnce && message.command === 'format.setRange' && message.payload) {
        rejectOnce = false
        message = { ...message, payload: {
          ...message.payload, request: { ...message.payload.request, sheetId: 'missing-layout-sheet' },
        } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await page.reload()
  await select(page, 'B3', '2:1')
  await page.getByRole('combobox', { name: 'Horizontal alignment' }).selectOption('right')
  await expect(page.getByRole('alert')).toContainText('Check the cell before retrying')
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'left')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await choose(page, 'Horizontal alignment', 'right')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'right')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveCSS('text-align', 'left')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('merged frozen fragments display all three choices from the same native anchor', async ({ page }) => {
  await select(page, 'C3', '2:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'B2:D4', '1:1')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Merge cells', exact: true }).click()
  const fragments = page.locator('[data-merged-cell="true"]')
  await expect(fragments).toHaveCount(4)
  await choose(page, 'Horizontal alignment', 'right')
  await choose(page, 'Vertical alignment', 'top')
  await choose(page, 'Text rotation', 'vertical')
  for (const fragment of await fragments.all()) {
    await expect(fragment).toHaveCSS('text-align', 'right')
    await expect(fragment).toHaveCSS('justify-content', 'flex-start')
    await expect(fragment.locator('.cell-content > span')).toHaveCSS('text-orientation', 'upright')
  }
  await choose(page, 'Horizontal alignment', 'default')
  await choose(page, 'Vertical alignment', 'default')
  await choose(page, 'Text rotation', '0')
  for (const fragment of await fragments.all()) {
    await expect(fragment).toHaveCSS('text-align', 'left')
    await expect(fragment).toHaveCSS('justify-content', 'flex-end')
    await expect(fragment).toHaveText('Acme Co.')
  }
})

for (const width of [1280, 390]) {
  test(`layout controls remain visible and keyboard accessible at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    await select(page, 'B3', '2:1')
    const rotation = page.getByRole('combobox', { name: 'Text rotation' })
    await rotation.scrollIntoViewIfNeeded()
    await rotation.focus()
    // 原生 select 的按字查找；macOS 无头 Chromium 不转发弹出菜单的方向键。
    await rotation.press('4')
    await expect(rotation).toBeEnabled()
    await expect(rotation).toHaveValue('45')
    await expect(rotation).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(rotation).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`text-layout-${width}.png`) })
  })
}
