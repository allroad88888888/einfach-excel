import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function open(page: Page, kind = 'fill') {
  await page.getByRole('button', { name: `Choose ${kind} color`, exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}
async function choose(page: Page, color: string, kind = 'fill') {
  await open(page, kind)
  await page.getByRole('button', { name: `Color ${color}`, exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('seed color is selected; preset changes preserve other fields and undo in one step', async ({ page }) => {
  await select(page, 'D2', '1:3')
  await open(page)
  await expect(page.getByRole('button', { name: 'Color #fff2cc' }))
    .toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await select(page, 'A2', '1:0')
  await choose(page, '#93c47d')
  await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(147, 196, 125)')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:0')).not.toHaveCSS('background-color', 'rgb(147, 196, 125)')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(147, 196, 125)')
  await select(page, 'E2', '1:4')
  await open(page, 'text')
  await expect(page.getByRole('button', { name: 'Color #c00000' }))
    .toHaveAttribute('aria-pressed', 'true')
})

test('custom Hex validates without writing; last colors remain independent across tools', async ({ page }) => {
  await select(page, 'B3:C4', '2:1')
  await open(page)
  const hex = page.getByRole('textbox', { name: 'Color hex' })
  await hex.fill('#xyz123')
  await hex.press('Enter')
  await expect(page.getByRole('alert')).toContainText('six-digit')
  await expect(hex).toHaveAttribute('aria-invalid', 'true')
  await hex.fill('#ABCDEF')
  await hex.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const coord of ['2:1', '2:2', '3:1', '3:2'])
    await expect(cell(page, coord)).toHaveCSS('background-color', 'rgb(171, 205, 239)')
  await choose(page, '#434343', 'text')
  await select(page, 'D5', '4:3')
  await page.getByRole('button', { name: 'Fill color', exact: true }).click()
  await expect(cell(page, '4:3')).toHaveCSS('background-color', 'rgb(171, 205, 239)')
  await page.getByRole('button', { name: 'Text color', exact: true }).click()
  await expect(cell(page, '4:3')).toHaveCSS('color', 'rgb(67, 67, 67)')
})

test('row then column then row colors obey last action at intersections without changing geometry', async ({ page }) => {
  const initial = await cell(page, '1:1').boundingBox()
  await select(page, 'B2', '1:1')
  await choose(page, '#6fa8dc')
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await choose(page, '#000000')
  await expect(cell(page, '1:1')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await choose(page, '#c00000')
  await expect(cell(page, '1:1')).toHaveCSS('background-color', 'rgb(192, 0, 0)')
  await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  await expect(cell(page, '2:1')).toHaveCSS('background-color', 'rgb(192, 0, 0)')
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await choose(page, '#93c47d')
  await expect(cell(page, '1:1')).toHaveCSS('background-color', 'rgb(147, 196, 125)')
  await expect(cell(page, '2:1')).toHaveCSS('background-color', 'rgb(192, 0, 0)')
  await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
  const after = await cell(page, '1:1').boundingBox()
  expect(after?.height).toBe(initial?.height)
  expect(after?.width).toBe(initial?.width)
  await select(page, 'B1001', '1000:1')
  await expect(cell(page, '1000:1')).toHaveCSS('background-color', 'rgb(192, 0, 0)')
})

test('reset is field-specific and preserves the other color and text style', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await choose(page, '#93c47d')
  await choose(page, '#434343', 'text')
  await open(page)
  await page.getByRole('button', { name: 'No fill', exact: true }).click()
  await expect(cell(page, '1:1')).not.toHaveCSS('background-color', 'rgb(147, 196, 125)')
  await expect(cell(page, '1:1')).toHaveCSS('color', 'rgb(67, 67, 67)')
  await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
  await open(page, 'text')
  await page.getByRole('button', { name: 'Automatic text color', exact: true }).click()
  await expect(cell(page, '1:1')).not.toHaveCSS('color', 'rgb(67, 67, 67)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:1')).toHaveCSS('color', 'rgb(67, 67, 67)')
})

test('No fill masks an inherited column color only at the target cell', async ({ page }) => {
  const original = await cell(page, '2:1').evaluate((node) => getComputedStyle(node).backgroundColor)
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await choose(page, '#93c47d')
  await select(page, 'B3', '2:1')
  await open(page)
  await page.getByRole('button', { name: 'No fill', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveCSS('background-color', original)
  await expect(cell(page, '3:1')).toHaveCSS('background-color', 'rgb(147, 196, 125)')
  await page.getByRole('button', { name: 'Select row 3', exact: true }).click()
  await choose(page, '#c00000', 'text')
  await select(page, 'B3', '2:1')
  await open(page, 'text')
  await page.getByRole('button', { name: 'Automatic text color' }).click()
  await expect(cell(page, '2:1')).not.toHaveCSS('color', 'rgb(192, 0, 0)')
  await expect(cell(page, '2:2')).toHaveCSS('color', 'rgb(192, 0, 0)')
})

test('a native rejection keeps the quick color retryable without a phantom undo', async ({ page }) => {
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
          ...message.payload, request: { ...message.payload.request, sheetId: 'missing-color-sheet' },
        } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await page.reload()
  await select(page, 'B3', '2:1')
  await page.getByRole('button', { name: 'Text color', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Check the cell before retrying')
  await expect(page.getByRole('textbox', { name: 'Color hex' })).toHaveValue('#c00000')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '2:1')).toHaveCSS('color', 'rgb(192, 0, 0)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:1')).not.toHaveCSS('color', 'rgb(192, 0, 0)')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('merged frozen fragments share native color; both editing entries disable the palette', async ({ page }) => {
  await select(page, 'C3', '2:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'B2:D4', '1:1')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Merge cells', exact: true }).click()
  await choose(page, '#93c47d')
  const fragments = page.locator('[data-merged-cell="true"]')
  await expect(fragments).toHaveCount(4)
  for (const fragment of await fragments.all())
    await expect(fragment).toHaveCSS('background-color', 'rgb(147, 196, 125)')
  const corner = page.locator('[data-frozen-pane="corner"] [data-merged-cell="true"]')
  await corner.dblclick({ position: { x: 8, y: 8 } })
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose fill color' })).toBeDisabled()
  await editor.press('Escape')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('Uncommitted')
  await expect(page.getByRole('button', { name: 'Choose text color' })).toBeDisabled()
  await formula.press('Escape')
  await expect(corner).toHaveText('Acme Co.')
})

test('native custom picker and backdrop dismissal do not create writes', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await open(page)
  await page.getByLabel('Custom color picker').fill('#123456')
  await expect(page.getByRole('textbox', { name: 'Color hex' })).toHaveValue('#123456')
  await page.mouse.click(10, 10)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('pending native format write disables palette actions until the single response arrives', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Object.defineProperty(window, 'releaseColorWrite', { value: () => release() })
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
  await open(page)
  await page.getByRole('button', { name: 'Color #93c47d' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Applying color' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Close color palette' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => Reflect.get(window, 'releaseColorWrite')())
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '1000:15')).toHaveCSS('background-color', 'rgb(147, 196, 125)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1000:15')).not.toHaveCSS('background-color', 'rgb(147, 196, 125)')
})

for (const width of [1280, 390]) {
  test(`palette stays inside ${width}px, traps keyboard focus and Escape returns to trigger`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    await select(page, 'D2', '1:3')
    await open(page)
    const dialog = page.getByRole('dialog')
    const rect = await dialog.boundingBox()
    expect(rect!.x).toBeGreaterThanOrEqual(8)
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width - 8)
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(792)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'Close color palette' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeFocused()
    await page.screenshot({ path: info.outputPath(`color-palette-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Choose fill color' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
