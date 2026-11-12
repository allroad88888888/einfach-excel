import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'

const more = (page: Page) => page.locator('[data-ribbon-more]')
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const group = (page: Page, id: string) => page.locator(`[data-ribbon-group="${id}"]`)

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
}

test('Start fits every group without More at 1280px', async ({ page }) => {
  await open(page, 1280)
  await expect(more(page)).toHaveCount(0)
  for (const id of ['history', 'clipboard', 'font', 'alignment', 'number', 'styles']) {
    await expect(group(page, id)).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Percent format', exact: true })).toBeVisible()
})

test('trailing groups fold into More and a folded tool applies at 760px', async ({ page }) => {
  await open(page, 760)
  const percent = page.getByRole('button', { name: 'Percent format', exact: true })
  await expect(more(page)).toHaveAccessibleName('More tools')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(group(page, 'font')).toBeVisible()
  await expect(percent).toBeHidden()

  await select(page, 'E2', '1:4')
  await more(page).click()
  await expect(more(page)).toHaveAccessibleName('Fewer tools')
  const section = page.getByRole('region', { name: 'Number', exact: true })
  await expect(section).toBeVisible()
  await expect(section.getByRole('button', { name: 'Percent format', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Styles', exact: true })).toBeVisible()
  const moreBox = (await more(page).boundingBox())!
  expect((await percent.boundingBox())!.y).toBeGreaterThan(moreBox.y + moreBox.height)

  await percent.click()
  await expect(cell(page, '1:4')).toHaveText('100%')
  await expect(cell(page, '1:5')).toHaveText('79')
  // 像下拉菜单：在面板里执行命令后收起。
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(more(page)).toBeFocused()
  await more(page).click()
  await expect(percent).toBeVisible()

  await page.getByRole('tab', { name: 'Data', exact: true }).click()
  await expect(percent).toBeHidden()
  await page.getByRole('tab', { name: 'Start', exact: true }).click()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(percent).toBeHidden()
})

test('Escape collapses More and returns focus to it at 760px', async ({ page }) => {
  await open(page, 760)
  await more(page).click()
  const clearAll = page.getByRole('button', { name: 'Clear all', exact: true })
  await expect(clearAll).toBeVisible()
  await clearAll.focus()
  await page.keyboard.press('Escape')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(more(page)).toBeFocused()
  await expect(clearAll).toBeHidden()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('clicking the grid collapses More and selects the cell at 760px', async ({ page }) => {
  await open(page, 760)
  await more(page).click()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  await cell(page, '3:2').click()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('C4')
  await expect(cell(page, '3:2')).toHaveText('South')
})

test('resizing restores folded groups and a folded select keeps keyboard focus at 390px', async ({ page }) => {
  await open(page, 390)
  await more(page).click()
  const rotation = page.getByRole('combobox', { name: 'Text rotation', exact: true })
  await rotation.focus()
  await rotation.press('4')
  await expect(rotation).toHaveValue('45')
  await expect(rotation).toBeFocused()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')

  await page.setViewportSize({ width: 1280, height: 850 })
  await expect(more(page)).toHaveCount(0)
  await expect(rotation).toBeFocused()
  await expect(rotation).toHaveValue('45')
  await expect(group(page, 'alignment')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 850 })
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(more(page)).toBeFocused()
  await more(page).click()
  await expect(rotation).toHaveValue('45')
})

test('a folded filter command closes More and leaves the header reachable at 390px', async ({ page }) => {
  await open(page, 390)
  await select(page, 'A1:H15', '0:0')
  await showRibbonItem(page, 'data.worksheet-filter')
  await page.getByRole('combobox', { name: 'Worksheet filter', exact: true }).selectOption('selection')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Filter column A', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Filter conditions', exact: true })).toBeVisible()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
})

test('a folded setting supports consecutive keyboard adjustments at 390px', async ({ page }) => {
  await open(page, 390)
  await select(page, 'E2', '1:4')
  await showRibbonItem(page, 'format.text-rotation')
  const rotation = page.getByRole('combobox', { name: 'Text rotation', exact: true })
  await rotation.focus()
  await rotation.press('4')
  await expect(cell(page, '1:4').locator('.cell-rotated-text')).toHaveCSS('transform', /matrix\(/)
  await expect(rotation).toBeFocused()
  await rotation.press('0')
  await expect(cell(page, '1:4').locator('.cell-rotated-text')).toHaveCount(0)
  await expect(rotation).toHaveValue('0')
  await expect(rotation).toBeFocused()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(cell(page, '1:4')).toHaveText('1')
  await expect(cell(page, '1:5')).toHaveText('79')
})

test('a delayed merge confirmation keeps its folded opener available at 390px', async ({ page }) => {
  await open(page, 390)
  await select(page, 'B2:C3', '1:1')
  await showRibbonItem(page, 'data.merge-cells')
  await page.evaluate(() => {
    const post = Worker.prototype.postMessage
    let delay = true
    Worker.prototype.postMessage = function (
      message: { command?: string }, options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const send = () => post.call(this, message,
        Array.isArray(options) ? { transfer: options } : (options ?? {}))
      if (delay && message.command === 'range.merge') {
        delay = false
        setTimeout(send, 150)
      } else send()
    }
  })
  const menu = page.getByRole('combobox', { name: 'Merge cells', exact: true })
  await menu.selectOption('merge')
  const dialog = page.getByRole('alertdialog', { name: 'Merge these cells?', exact: true })
  await expect(dialog).toBeVisible()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(menu).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(menu).toBeFocused()
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(cell(page, '1:2')).toHaveText('North')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
