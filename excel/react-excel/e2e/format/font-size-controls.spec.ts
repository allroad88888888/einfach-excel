import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const sizeControl = (page: Page) => page.getByRole('combobox', { name: 'Font size', exact: true })
async function rejectNextFontWrite(page: Page) {
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
          ...message.payload, request: { ...message.payload.request, sheetId: 'missing-font-sheet' },
        } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await page.reload()
}
async function custom(page: Page, value: string) {
  await sizeControl(page).selectOption('custom')
  await page.getByRole('spinbutton', { name: 'Custom font size' }).fill(value)
  await page.getByRole('button', { name: 'Apply font size', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Custom font size' })).toHaveCount(0)
  await expect(sizeControl(page)).toHaveValue(value)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('native custom seed and default size match the grid and the two adjacent steps', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await expect(sizeControl(page)).toHaveValue('12')
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '12px')
  await select(page, 'H4', '3:7')
  await expect(sizeControl(page)).toHaveValue('13')
  await expect(cell(page, '3:7')).toHaveCSS('font-size', '13px')
  await page.getByRole('button', { name: 'Increase font size' }).click()
  await expect(cell(page, '3:7')).toHaveCSS('font-size', '14px')
  await page.getByRole('button', { name: 'Decrease font size' }).click()
  await expect(cell(page, '3:7')).toHaveCSS('font-size', '12px')
})

test('custom size grows only its row, preserves other styles and undoes with the row height', async ({ page }) => {
  await select(page, 'B2', '1:1')
  const target = cell(page, '1:1')
  const before = await target.boundingBox()
  const neighborHeight = (await cell(page, '2:1').boundingBox())!.height
  await custom(page, '37')
  await expect(target).toHaveCSS('font-size', '37px')
  await expect(target).toHaveCSS('font-style', 'italic')
  await expect(target).toHaveText('Acme Co.')
  await expect.poll(async () => (await target.boundingBox())?.height).toBeGreaterThan(37)
  expect((await target.boundingBox())!.width).toBe(before!.width)
  expect((await cell(page, '2:1').boundingBox())!.height).toBe(neighborHeight)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(target).toHaveCSS('font-size', '12px')
  await expect.poll(async () => (await target.boundingBox())?.height).toBe(before!.height)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(target).toHaveCSS('font-size', '37px')
})

test('increase and decrease step around a custom size and never shrink a row implicitly', async ({ page }) => {
  await select(page, 'B3:C3', '2:1')
  await custom(page, '37')
  await page.getByRole('button', { name: 'Increase font size' }).click()
  await expect(cell(page, '2:2')).toHaveCSS('font-size', '48px')
  const grown = (await cell(page, '2:1').boundingBox())!.height
  await page.getByRole('button', { name: 'Decrease font size' }).click()
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '36px')
  expect((await cell(page, '2:1').boundingBox())!.height).toBe(grown)
  await expect(cell(page, '2:3')).toHaveCSS('font-size', '12px')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '48px')
})

test('invalid custom sizes can be corrected and cancel has no native history', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await sizeControl(page).selectOption('custom')
  const input = page.getByRole('spinbutton', { name: 'Custom font size' })
  for (const value of ['', '0', '12.5', '513']) {
    await input.fill(value)
    await page.getByRole('button', { name: 'Apply font size' }).click()
    await expect(page.getByRole('alert')).toContainText('whole-number')
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await custom(page, '23')
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '23px')
})

test('row then column font sizes use native last-write rules and reach offscreen records', async ({ page }) => {
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await custom(page, '23')
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await custom(page, '37')
  await expect(cell(page, '1:1')).toHaveCSS('font-size', '37px')
  await expect(cell(page, '1:0')).toHaveCSS('font-size', '23px')
  await expect.poll(async () => (await cell(page, '2:1').boundingBox())?.height).toBeGreaterThan(37)
  await select(page, 'B1001', '1000:1')
  await expect(cell(page, '1000:1')).toHaveCSS('font-size', '37px')
  await expect.poll(async () => (await cell(page, '1000:1').boundingBox())?.height).toBeGreaterThan(37)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'B1001', '1000:1')
  await expect(cell(page, '1000:1')).toHaveCSS('font-size', '12px')
  await expect(cell(page, '1000:1')).toHaveCSS('height', '28px')
})

test('size boundaries and both editing inputs disable the corresponding tools', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await custom(page, '1')
  await expect(page.getByRole('button', { name: 'Decrease font size' })).toBeDisabled()
  await custom(page, '512')
  await expect(cell(page, '2:1')).toHaveCSS('height', '622px')
  await expect(page.getByRole('button', { name: 'Increase font size' })).toBeDisabled()
  await custom(page, '12')
  await cell(page, '2:1').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('Unsaved')
  await expect(sizeControl(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Increase font size' })).toBeDisabled()
  await editor.press('Escape')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('Another draft')
  await expect(page.getByRole('button', { name: 'Decrease font size' })).toBeDisabled()
  await formula.press('Escape')
  await expect(cell(page, '2:1')).toHaveText('Northwind')
})

test('native rejection retains the custom draft and retry produces one history entry', async ({ page }) => {
  await rejectNextFontWrite(page)
  await select(page, 'B3', '2:1')
  await sizeControl(page).selectOption('custom')
  const input = page.getByRole('spinbutton', { name: 'Custom font size' })
  await input.fill('23')
  await page.getByRole('button', { name: 'Apply font size' }).click()
  await expect(page.getByRole('alert')).toContainText('Check the cell before retrying')
  await expect(input).toHaveValue('23')
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Apply font size' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '23px')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '12px')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('pending custom size disables editing and cancellation until the native response', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let release = () => {}
    Object.defineProperty(window, 'releaseFontWrite', { value: () => release() })
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
  await select(page, 'B3', '2:1')
  await sizeControl(page).selectOption('custom')
  const input = page.getByRole('spinbutton', { name: 'Custom font size' })
  await input.fill('23')
  await page.getByRole('button', { name: 'Apply font size' }).click()
  await expect(input).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Apply font size' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Applying font size' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => Reflect.get(window, 'releaseFontWrite')())
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(sizeControl(page)).toBeFocused()
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '23px')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:1')).toHaveCSS('font-size', '12px')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('custom font size reaches all frozen merged fragments without changing text or italic', async ({ page }) => {
  await select(page, 'C3', '2:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'B2:D4', '1:1')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Merge cells', exact: true }).click()
  const fragments = page.locator('[data-merged-cell="true"]')
  await expect(fragments).toHaveCount(4)
  await custom(page, '23')
  for (const fragment of await fragments.all()) {
    await expect(fragment).toHaveCSS('font-size', '23px')
    await expect(fragment).toHaveCSS('font-style', 'italic')
    await expect(fragment).toHaveText('Acme Co.')
  }
})

for (const [action, expected] of [['Increase', '14'], ['Decrease', '11']]) {
  test(`failed ${action} stays readable and retries at 390px`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await rejectNextFontWrite(page)
    await select(page, 'B3', '2:1')
    await page.getByRole('button', { name: `${action} font size` }).click()
    await expect(page.getByRole('dialog', { name: 'Custom font size' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Check the cell before retrying')
    await expect(page.getByRole('spinbutton', { name: 'Custom font size' })).toHaveValue(expected!)
    const error = (await page.getByRole('alert').boundingBox())!
    expect(error.x).toBeGreaterThanOrEqual(0)
    expect(error.x + error.width).toBeLessThanOrEqual(390)
    await page.screenshot({ path: info.outputPath(`font-size-${action}-error-390.png`) })
    await page.getByRole('button', { name: 'Apply font size' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(cell(page, '2:1')).toHaveCSS('font-size', `${expected}px`)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '2:1')).toHaveCSS('font-size', '12px')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}

for (const width of [1280, 390]) {
  test(`custom size dialog fits ${width}px and keyboard cancellation restores focus`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    await select(page, 'B3', '2:1')
    await sizeControl(page).selectOption('custom')
    const input = page.getByRole('spinbutton', { name: 'Custom font size' })
    await expect(input).toBeFocused()
    await input.fill('23')
    await input.press('Shift+Tab')
    await expect(page.getByRole('button', { name: 'Apply font size' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('dialog')).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`font-size-${width}.png`) })
    await input.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(sizeControl(page)).toBeFocused()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    const increase = page.getByRole('button', { name: 'Increase font size' })
    await increase.focus()
    await increase.press('Enter')
    await expect(sizeControl(page)).toHaveValue('14')
    await expect(increase).toBeFocused()
  })
}
