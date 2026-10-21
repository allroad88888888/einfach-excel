import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Data validation', exact: true })
const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const cases = [
  { kind: 'whole-number', min: '1', max: '10', valid: '7', invalid: '7.5', display: '7' },
  { kind: 'decimal', min: '0', max: '1', valid: '0.75', invalid: '2', display: '0.75' },
  { kind: 'list', min: '', max: '', valid: 'On hold', invalid: 'Unknown', display: 'On hold' },
  { kind: 'date', min: '2026-10-01', max: '2026-10-31',
    valid: '2026-10-11', invalid: '2026-11-01', display: '2026-10-11' },
  { kind: 'time', min: '09:00', max: '17:00', valid: '12:00', invalid: '18:00', display: '12:00' },
  { kind: 'text-length', min: '2', max: '4', valid: '中文🙂', invalid: 'x', display: '中文🙂' },
] as const

async function open(page: Page) {
  await button(page, 'Data validation').click()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByLabel('Allow', { exact: true })).toBeEnabled()
}

// D45:D46 原来没有验证；规则由真实 Apply 写入，不从测试夹具注入 Core 状态。
for (const width of [1280, 390]) test.describe(`${width}px validation rule creation`, () => {
  test.use({ viewport: { width, height: 850 } })
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'D45:D46', '44:3')
  })

  test(`clear seeded validation keeps values and undoes once at ${width}px`, async ({ page }) => {
    await select(page, 'H47', '46:7'); await open(page)
    await expect(page.getByLabel('Allow', { exact: true })).toHaveValue('list')
    await button(page, 'Clear validation').click(); await expect(dialog(page)).toHaveCount(0)
    const choices = page.getByRole('combobox', { name: 'Choose cell value' })
    await expect(choices).toHaveCount(0)
    await expect(cell(page, '46:7')).toHaveText('Ready')
    await expect(cell(page, '45:7')).toHaveText('0.5')
    await button(page, 'Undo').click()
    await expect(choices).toBeVisible(); await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click(); await expect(choices).toHaveCount(0)
    await bar(page).fill('Unlisted'); await bar(page).press('Enter')
    await expect(cell(page, '46:7')).toHaveText('Unlisted')
    await button(page, 'Undo').click(); await expect(cell(page, '46:7')).toHaveText('Ready')
    await button(page, 'Undo').click()
    await expect(button(page, 'Undo')).toBeDisabled()
    await select(page, 'H47', '46:7'); await expect(choices).toBeVisible()
    await expect(cell(page, '44:7')).toHaveText('5')
  })

  test(`change validation range preserves existing values and restores neighboring rules at ${width}px`, async ({ page }) => {
    await select(page, 'H45', '44:7'); await open(page)
    await page.getByLabel('Applies to', { exact: true }).fill('H45:H46')
    await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
    await expect(cell(page, '44:7')).toHaveText('5')
    await expect(cell(page, '45:7')).toHaveText('0.5')
    await expect(cell(page, '46:7')).toHaveText('Ready')
    await select(page, 'H46', '45:7'); await open(page)
    await expect(page.getByLabel('Allow', { exact: true })).toHaveValue('whole-number')
    await expect(page.getByLabel('Minimum', { exact: true })).toHaveValue('1')
    await expect(page.getByLabel('Maximum', { exact: true })).toHaveValue('10')
    await button(page, 'Cancel').click(); await button(page, 'Undo').click()
    await expect(button(page, 'Undo')).toBeDisabled()
    await open(page); await expect(page.getByLabel('Allow', { exact: true })).toHaveValue('decimal')
    await expect(page.getByLabel('Minimum', { exact: true })).toHaveValue('0')
    await expect(page.getByLabel('Maximum', { exact: true })).toHaveValue('1')
    await button(page, 'Cancel').click(); await button(page, 'Redo').click()
    await bar(page).fill('0.75'); await bar(page).press('Enter')
    await expect(page.getByRole('alert')).toContainText('data validation rule')
    await expect(cell(page, '45:7')).toHaveText('0.5'); await bar(page).press('Escape')
    await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
    await bar(page).fill('0.75'); await bar(page).press('Enter')
    await expect(cell(page, '45:7')).toHaveText('0.75')
    await button(page, 'Undo').click(); await expect(cell(page, '45:7')).toHaveText('0.5')
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(cell(page, '46:7')).toHaveText('Ready')
  })

  for (const closing of ['cancel', 'escape'])
    test(`${closing} validation discards all draft fields without history at ${width}px`, async ({ page }) => {
      await select(page, 'H47', '46:7'); await open(page)
      await page.getByLabel('Applies to', { exact: true }).fill('D45:D46')
      await page.getByLabel('Allow', { exact: true }).selectOption('whole-number')
      await page.getByLabel('Minimum', { exact: true }).fill('1')
      await page.getByLabel('Maximum', { exact: true }).fill('2')
      await page.getByLabel('Ignore blank cells', { exact: true }).uncheck()
      if (closing === 'cancel') await button(page, 'Cancel').click()
      else await page.getByLabel('Maximum', { exact: true }).press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      await expect(button(page, 'Data validation')).toBeFocused()
      await expect(button(page, 'Undo')).toBeDisabled()
      await expect(cell(page, '46:7')).toHaveText('Ready')
      await expect(cell(page, '44:7')).toHaveText('5')
      await expect(page.getByRole('combobox', { name: 'Choose cell value' })).toBeVisible()
      await open(page)
      await expect(page.getByLabel('Applies to', { exact: true })).toHaveValue('H47')
      await expect(page.getByLabel('Allow', { exact: true })).toHaveValue('list')
      await expect(page.getByLabel('Items, one per line')).toHaveValue('Ready\nOn hold\n001\n=1+2')
      await expect(page.getByLabel('Ignore blank cells', { exact: true })).toBeChecked()
    })

  for (const [mode, address, coord, original, previous] of [
    ['enable', 'H51', '50:7', '中文🙂', false],
    ['disable', 'H45', '44:7', '5', true],
  ] as const)
    test(`${mode} ignore blank changes native input and undoes once at ${width}px`, async ({ page }) => {
      const enabled = mode === 'enable'
      const flag = page.getByLabel('Ignore blank cells', { exact: true })
      await select(page, address, coord); await open(page)
      await expect(flag).toBeChecked({ checked: previous })
      await flag.setChecked(enabled)
      await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
      await expect(cell(page, coord)).toHaveText(original)
      await open(page); await expect(flag).toBeChecked({ checked: enabled })
      await button(page, 'Cancel').click(); await button(page, 'Undo').click()
      await expect(button(page, 'Undo')).toBeDisabled()
      await open(page); await expect(flag).toBeChecked({ checked: previous })
      await button(page, 'Cancel').click(); await button(page, 'Redo').click()
      await open(page); await expect(flag).toBeChecked({ checked: enabled })
      await button(page, 'Cancel').click()
      await bar(page).fill(''); await bar(page).press('Enter')
      if (enabled) {
        await expect(cell(page, coord)).toHaveText('')
        await button(page, 'Undo').click(); await expect(cell(page, coord)).toHaveText(original)
      } else {
        await expect(page.getByRole('alert')).toContainText('data validation rule')
        await expect(cell(page, coord)).toHaveText(original)
        await expect(bar(page)).toHaveValue(''); await bar(page).press('Escape')
      }
      await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
      await expect(cell(page, '45:7')).toHaveText('0.5')
    })

  for (const entry of cases)
    test(`create ${entry.kind} validation independently and undo once at ${width}px`, async ({ page }) => {
      await open(page)
      await page.getByLabel('Allow', { exact: true }).selectOption(entry.kind)
      if (entry.kind === 'list') await page.getByLabel('Items, one per line').fill('Ready\nOn hold')
      else {
        await page.getByLabel('Minimum', { exact: true }).fill(entry.min)
        await page.getByLabel('Maximum', { exact: true }).fill(entry.max)
      }
      await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
      await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
      await open(page)
      await expect(page.getByLabel('Allow', { exact: true })).toHaveValue(entry.kind)
      if (entry.kind === 'list') await expect(page.getByLabel('Items, one per line')).toHaveValue('Ready\nOn hold')
      else {
        await expect(page.getByLabel('Minimum', { exact: true })).toHaveValue(entry.min)
        await expect(page.getByLabel('Maximum', { exact: true })).toHaveValue(entry.max)
      }
      await button(page, 'Cancel').click(); await button(page, 'Undo').click()
      await expect(button(page, 'Undo')).toBeDisabled()
      await open(page)
      await expect(page.getByLabel('Allow', { exact: true })).toHaveValue('whole-number')
      await expect(page.getByLabel('Minimum', { exact: true })).toHaveValue('0')
      await expect(page.getByLabel('Maximum', { exact: true })).toHaveValue('100')
      await button(page, 'Cancel').click(); await button(page, 'Redo').click()
      await select(page, 'D45', '44:3')
      await bar(page).fill(entry.valid); await bar(page).press('Enter')
      await expect(cell(page, '44:3')).toHaveText(entry.display)
      // 非法值仍写普通数据格，确保测到上下界，而非 Table 表头固有的文字类型限制。
      await select(page, 'D45', '44:3')
      await bar(page).fill(entry.invalid); await bar(page).press('Enter')
      await expect(page.getByRole('alert')).toContainText('data validation rule')
      await expect(bar(page)).toHaveValue(entry.invalid)
      await expect(cell(page, '44:3')).toHaveText(entry.display)
      await expect(cell(page, '45:3')).toHaveText('')
      await bar(page).press('Escape')
      await expect(cell(page, '44:5')).toHaveText('Integer 1–10')
      await expect(cell(page, '44:7')).toHaveText('5')
    })
})
