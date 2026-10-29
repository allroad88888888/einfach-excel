import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { catalogPart, expectPickerHelp, nativeCatalog as catalog } from '../support/native-function-help'

/** Per-entry help checks are split so each test stays well under the timeout on slow CI runners. */
const HELP_PARTS = 12

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-cell="1:0"]')).toHaveText('SO-10001')
})

async function openPicker(page: Page) {
  const opener = page.getByRole('button', { name: 'Insert function', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Insert function' })
  const list = dialog.getByRole('listbox', { name: 'Function', exact: true })
  return { opener, dialog, list }
}

for (const variant of ['lite', 'full']) test(`HELP-001 ${variant} artifact contains complete actual help`, async ({ page }) => {
  const native = await catalog(page, variant)
  expect(native.version).toBe(2)
  expect(native.functions).toHaveLength(variant === 'full' ? 502 : 499)
  expect(new Set(native.functions.map(({ name }) => name)).size).toBe(native.functions.length)
  for (const { name, help } of native.functions) {
    expect(help.summary, name).not.toBe('')
    expect(help.summary_zh, name).not.toBe('')
    expect(help.examples.length, name).toBeGreaterThan(0)
    expect(help.args.some((arg) => arg.name === 'args'), name).toBe(false)
    for (const arg of help.args) {
      expect(arg.description, `${name}.${arg.name}`).not.toBe('')
      expect(arg.description_zh, `${name}.${arg.name}`).not.toBe('')
      expect(typeof arg.optional).toBe('boolean')
      expect(typeof arg.repeats).toBe('boolean')
    }
  }
})

for (const width of [1280, 390]) test(`HELP-002 picker lists every real entry with custom help and fitting layout at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 850 })
  const native = await catalog(page, 'lite')
  await select(page, 'B2', '1:1')
  const { opener, dialog, list } = await openPicker(page)
  await expect(list.locator('option')).toHaveCount(native.functions.length + 1)
  expect((await list.locator('option').allTextContents()).sort())
    .toEqual([...native.functions.map(({ name }) => name), 'ORDER_NET'].sort())
  const names = (entries: { name: string }[]) => entries.map(({ name }) => name).sort()
  const parts = Array.from({ length: HELP_PARTS }, (_, i) => catalogPart(native, i, HELP_PARTS))
  expect(names(parts.flat())).toEqual(names(native.functions))
  await list.selectOption('ORDER_NET')
  const custom = dialog.locator('[data-formula-help="ORDER_NET"]')
  await expect(custom.locator('[data-formula-help-signature]')).toHaveText('ORDER_NET(QUANTITY, PRICE)')
  await expect(custom.locator('.formula-help-summary')).toHaveText('=QUANTITY*PRICE')
  await expect(custom.locator('[data-parameter]')).toHaveCount(0)
  await list.selectOption('LET')
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  await page.screenshot({ path: testInfo.outputPath(`help-catalog-${width}.png`) })
  await dialog.locator('.insert-function-actions').scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(dialog.getByRole('button', { name: 'Insert draft', exact: true })).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath(`help-catalog-footer-${width}.png`) })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect(page.locator('[data-cell="1:1"]')).toHaveText('Acme Co.')
  await expect(page.locator('[data-cell="2:1"]')).toHaveText('Northwind')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

for (const width of [1280, 390]) for (let part = 0; part < HELP_PARTS; part++) {
  test(`HELP-002 picker entries part ${part + 1}/${HELP_PARTS} render their own help at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 850 })
    const entries = catalogPart(await catalog(page, 'lite'), part, HELP_PARTS)
    expect(entries.length).toBeGreaterThan(0)
    const { dialog, list } = await openPicker(page)
    for (const { name, help } of entries) {
      await test.step(name, () => expectPickerHelp(dialog, list, name, help))
    }
  })
}

for (const width of [1280, 390]) test(`HELP-003 Chinese parameters and implementation limits at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 850 })
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
  await page.getByRole('button', { name: '插入函数', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '插入函数' })
  const list = dialog.getByRole('listbox')
  await list.selectOption('XLOOKUP')
  const help = dialog.locator('[data-formula-help="XLOOKUP"]')
  await expect(help).toContainText('查找')
  await expect(help).toContainText('参数')
  await expect(help).toContainText('可选')
  await expect(help).toContainText('示例')
  await list.selectOption('TRANSLATE')
  await expect(dialog.locator('[data-formula-help="TRANSLATE"]')).toContainText('字符')
  await expect(dialog.locator('.formula-help-limitations')).toContainText('语言')
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath(`help-chinese-${width}.png`) })
  const limits = dialog.locator('.formula-help-limitations')
  await limits.scrollIntoViewIfNeeded()
  await expect(limits).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath(`help-chinese-limits-${width}.png`) })
  await dialog.locator('.insert-function-actions').scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(dialog.getByRole('button', { name: '插入公式草稿', exact: true })).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath(`help-chinese-footer-${width}.png`) })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-cell="1:1"]')).toHaveText('Acme Co.')
})
