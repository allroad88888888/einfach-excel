import { expect, test, type Page } from '@playwright/test'
import { select, copy, pasteOption } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function open(page: Page) {
  await button(page, 'Paste special').click()
  await expect(page.getByRole('dialog', { name: 'Paste special' })).toBeVisible()
}
async function apply(page: Page) {
  await button(page, 'Apply paste').click()
  await expect(page.getByRole('dialog', { name: 'Paste special' })).toHaveCount(0)
  await expect(page.getByLabel('Clipboard status')).toHaveText('Pasted cells.')
}
test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('divide uses the destination as dividend and undo restores the seed', async ({ page }) => {
  await select(page, 'E4', '3:4')
  await copy(page)
  await select(page, 'E10', '9:4')
  await pasteOption(page, 'divide')
  await expect(cell(page, '9:4')).toHaveText('3')
  await button(page, 'Undo').click()
  await expect(cell(page, '9:4')).toHaveText('9')
  await button(page, 'Redo').click()
  await expect(cell(page, '9:4')).toHaveText('3')
})

test('divide by zero is a native undoable cell error', async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText('0'))
  await select(page, 'E4', '3:4')
  await pasteOption(page, 'divide')
  await expect(cell(page, '3:4')).toHaveText('#DIV/0!')
  await button(page, 'Undo').click()
  await expect(cell(page, '3:4')).toHaveText('3')
})

test('values, multiplication, transpose and skip blanks compose in one undo step', async ({
  page,
}) => {
  await page.evaluate(() => navigator.clipboard.writeText('2\t\n4\t8'))
  await select(page, 'E4:F5', '3:4')
  await open(page)
  await page.getByLabel('Paste content', { exact: true }).selectOption('values')
  await page.getByLabel('Operation', { exact: true }).selectOption('multiply')
  await page.getByLabel('Transpose', { exact: true }).check()
  await page.getByLabel('Skip blanks', { exact: true }).check()
  await apply(page)
  for (const [coord, value] of [
    ['3:4', '6'],
    ['3:5', '596'],
    ['4:4', '4'],
    ['4:5', '952'],
  ])
    await expect(cell(page, coord!)).toHaveText(value!)
  await button(page, 'Undo').click()
  await expect(cell(page, '3:4')).toHaveText('3')
  await expect(cell(page, '3:5')).toHaveText('149')
  await expect(cell(page, '4:5')).toHaveText('119')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('values arithmetic freezes the copied result but retains the destination formula', async ({
  page,
}) => {
  await select(page, 'G2', '1:6')
  await copy(page)
  await select(page, 'E2', '1:4')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('2')
  await formula.press('Enter')
  await expect(cell(page, '1:6')).toHaveText('158')
  await select(page, 'G4', '3:6')
  await open(page)
  await page.getByLabel('Paste content', { exact: true }).selectOption('values')
  await page.getByLabel('Operation', { exact: true }).selectOption('add')
  await apply(page)
  await expect(cell(page, '3:6')).toHaveText('526')
  await expect(formula).toHaveValue('=((E4*F4)+79)')
  await select(page, 'E4', '3:4')
  await formula.fill('4')
  await formula.press('Enter')
  await expect(cell(page, '3:6')).toHaveText('675')
})

test('native rejection stays in the dialog and permits correcting the option', async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText('2'))
  await select(page, 'E4', '3:4')
  await open(page)
  await page.getByLabel('Paste content', { exact: true }).selectOption('formats')
  await button(page, 'Apply paste').click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('no workbook formatting')
  await expect(cell(page, '3:4')).toHaveText('3')
  await page.getByLabel('Paste content', { exact: true }).selectOption('values')
  await apply(page)
  await expect(cell(page, '3:4')).toHaveText('2')
})

test('cancel discards choices and width-only clears incompatible options', async ({ page }) => {
  await open(page)
  await page.getByLabel('Operation', { exact: true }).selectOption('multiply')
  await page.getByLabel('Transpose', { exact: true }).check()
  await page.getByLabel('Paste content', { exact: true }).selectOption('column-widths')
  await expect(page.getByLabel('Operation', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Operation', { exact: true })).toHaveValue('none')
  await expect(page.getByLabel('Transpose', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Skip blanks', { exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(button(page, 'Paste special')).toBeFocused()
  await open(page)
  await expect(page.getByLabel('Paste content', { exact: true })).toHaveValue('all')
  await button(page, 'Cancel').click()
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('waiting for clipboard permission renders busy controls before Rust paste completes', async ({
  page,
}) => {
  await page.evaluate(() => {
    // 只延迟浏览器权限边界，放行后仍使用真实剪贴板与 Rust Worker。
    const read = navigator.clipboard.read.bind(navigator.clipboard)
    let release!: () => void
    const permission = new Promise<void>((resolve) => {
      release = resolve
    })
    Object.defineProperty(navigator.clipboard, 'read', {
      configurable: true,
      value: () => permission.then(read),
    })
    window.addEventListener('release-clipboard-permission', () => release(), { once: true })
    return navigator.clipboard.writeText('2')
  })
  await select(page, 'E4', '3:4')
  await open(page)
  await button(page, 'Apply paste').click()
  const dialog = page.getByRole('dialog', { name: 'Paste special' })
  await expect(dialog.getByRole('status')).toHaveText('Pasting…')
  for (const label of ['Paste content', 'Operation', 'Transpose', 'Skip blanks'])
    await expect(page.getByLabel(label, { exact: true })).toBeDisabled()
  await expect(button(page, 'Apply paste')).toBeDisabled()
  await expect(button(page, 'Cancel')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(cell(page, '3:4')).toHaveText('3')
  await page.evaluate(() => window.dispatchEvent(new Event('release-clipboard-permission')))
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '3:4')).toHaveText('2')
  await button(page, 'Undo').click()
  await expect(cell(page, '3:4')).toHaveText('3')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('paste dialog fits desktop and narrow screens with keyboard focus and readable errors', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.reload()
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.evaluate(() => navigator.clipboard.writeText('2'))
    await open(page)
    const dialog = page.getByRole('dialog', { name: 'Paste special' })
    await expect(page.getByLabel('Paste content', { exact: true })).toBeFocused()
    await page.getByLabel('Paste content', { exact: true }).selectOption('column-widths')
    await button(page, 'Apply paste').click()
    await expect(dialog.getByRole('alert')).toContainText('no workbook formatting')
    await expect(dialog).toBeInViewport()
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    for (const name of ['Apply paste', 'Cancel']) await expect(button(page, name)).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`paste-special-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(button(page, 'Paste special')).toBeFocused()
  }
  expect(errors).toEqual([])
})
