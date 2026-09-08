import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const grid = (page: Page) => page.locator('[data-workbook-grid]')
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
async function visibility(page: Page, action: string) {
  const menu = page.getByRole('combobox', { name: 'Row and column visibility' })
  await menu.scrollIntoViewIfNeeded()
  await menu.selectOption(action)
  await expect(menu).toBeEnabled()
  await expect(menu).toHaveValue('')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('pointer selection and drag use collapsed row and column geometry', async ({ page }) => {
  await select(page, 'B3:D5', '2:1')
  await visibility(page, 'hide-columns')
  await select(page, 'A3:A5', '2:0')
  await visibility(page, 'hide-rows')
  await select(page, 'A1', '0:0')
  await cell(page, '5:4').click()
  await expect(nameBox(page)).toHaveValue('E6')
  const start = await cell(page, '1:0').boundingBox()
  const end = await cell(page, '6:5').boundingBox()
  await page.mouse.move(start!.x + 10, start!.y + 10)
  await page.mouse.down()
  await page.mouse.move(end!.x + 10, end!.y + 10, { steps: 5 })
  await page.mouse.up()
  await expect(nameBox(page)).toHaveValue('A2:F7')
  await expect(cell(page, '5:4')).toHaveAttribute('data-selected', 'true')
})

test('Shift PageDown skips a long hidden interval and Shift PageUp returns to its anchor', async ({
  page,
}) => {
  await select(page, 'A3:A900', '2:0')
  await visibility(page, 'hide-rows')
  await select(page, 'A2', '1:0')
  await grid(page).press('Shift+PageDown')
  await expect(nameBox(page)).toHaveValue(/^A2:A9\d\d$/)
  const end = Number((await nameBox(page).inputValue()).split(':A')[1])
  await expect(cell(page, `${end - 1}:0`)).toBeInViewport()
  await grid(page).press('Shift+PageUp')
  await expect(nameBox(page)).toHaveValue('A2')
  await expect(cell(page, '1:0')).toBeInViewport()
})

test('editing Enter and Tab also skip hidden rows and columns', async ({ page }) => {
  await select(page, 'A3:A5', '2:0')
  await visibility(page, 'hide-rows')
  await select(page, 'B2:D2', '1:1')
  await visibility(page, 'hide-columns')
  await select(page, 'A2', '1:0')
  await grid(page).press('F2')
  const editor = page.getByRole('textbox', { name: 'Cell editor' })
  await editor.fill('Edited')
  await editor.press('Enter')
  await expect(nameBox(page)).toHaveValue('A6')
  await grid(page).press('F2')
  await editor.fill('Next')
  await editor.press('Tab')
  await expect(nameBox(page)).toHaveValue('E6')
  await select(page, 'A2', '1:0')
  await expect(cell(page, '1:0')).toHaveText('Edited')
  await expect(cell(page, '5:0')).toHaveText('Next')
})

test('Control Home finds the first visible coordinate when both leading axes are hidden', async ({
  page,
}) => {
  await select(page, 'A1:A4', '0:0')
  await visibility(page, 'hide-rows')
  await select(page, 'A5:C5', '4:0')
  await visibility(page, 'hide-columns')
  await select(page, 'H20', '19:7')
  await grid(page).press('ControlOrMeta+Home')
  await expect(nameBox(page)).toHaveValue('D5')
  await expect(cell(page, '4:3')).toBeInViewport()
})

test('delete then undo restores the original hidden seed metadata and its sizes', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await page.getByRole('button', { name: 'Delete sheet', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete worksheet' }).click()
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await expect(cell(page, '9:0')).toHaveCount(0)
  await expect(cell(page, '0:6')).toHaveCount(0)
  await visibility(page, 'unhide-all')
  await expect(cell(page, '9:0')).toHaveText('Hidden row example')
  await expect(cell(page, '0:6')).toHaveText('Hidden column example')
  const bounds = await cell(page, '0:0').boundingBox()
  expect(bounds!.width).toBe(200)
  expect(bounds!.height).toBe(40)
})

test('hidden and empty states remain usable at desktop and narrow widths', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await select(page, 'A3:A5', '2:0')
    await visibility(page, 'hide-rows')
    const menu = page.getByRole('combobox', { name: 'Row and column visibility' })
    await menu.focus()
    await expect(menu).toBeFocused()
    await expect(menu).toBeInViewport()
    expect(
      await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return element.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        )
      }),
    ).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`hidden-rows-${width}.png`) })
    await page.getByRole('button', { name: 'Select all cells' }).click()
    await visibility(page, 'hide-rows')
    await expect(page.locator('td[data-cell]')).toHaveCount(0)
    await expect(page.locator('.selection-outline')).toHaveCount(0)
    await expect(
      page.getByRole('status').filter({ hasText: 'All rows are hidden' }),
    ).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`all-hidden-${width}.png`) })
    await visibility(page, 'unhide-all')
    await select(page, 'A2', '1:0')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
  }
  expect(errors).toEqual([])
})
