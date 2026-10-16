import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function border(page: Page, preset: string, style: string, color: string) {
  await page.getByRole('button', { name: 'Border settings', exact: true }).click()
  await page.getByLabel('Position', { exact: true }).selectOption(preset)
  await page.getByLabel('Line style', { exact: true }).selectOption(style)
  await page.getByLabel('Hex color', { exact: true }).fill(color)
  await page.getByRole('button', { name: 'Apply borders', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
}
async function sourceToTarget(page: Page, writer: string, source = 'A2', coord = '1:0') {
  await select(page, source, coord)
  if (writer === 'painter') {
    const brush = page.getByRole('button', { name: 'Format painter', exact: true })
    await brush.click()
    await expect(brush).toHaveAttribute('aria-busy', 'false')
    await expect(brush).toHaveAttribute('data-painter-mode', 'armed')
  } else await copy(page)
  await select(page, 'C10', '9:2')
  if (writer === 'painter') {
    await page.locator('[data-workbook-grid]').press('Enter')
    await expect(page.getByLabel('Format painter status')).toContainText('Formatting applied.')
  } else if (writer === 'formats') await paste(page, 'Paste formatting only')
  else await paste(page)
  await select(page, 'A1', '0:0')
}
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'A2', '1:0')
  await border(page, 'left', 'thin', '#123abc')
  await select(page, 'C10', '9:2')
  await border(page, 'outside', 'thick', '#c00000')
  await select(page, 'A1', '0:0')
  await cell(page, '9:2').click()
})

for (const writer of ['painter', 'formats', 'all']) {
  test(`${writer} replaces both faces, preserves unrelated content and undoes once`, async ({ page }) => {
    const before = await cell(page, '9:2').textContent()
    const neighbour = await cell(page, '9:1').textContent()
    await sourceToTarget(page, writer)
    await expect(cell(page, '9:1')).toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
    await expect(cell(page, '9:1')).toHaveCSS('border-right-width', '1px')
    await expect(cell(page, '9:2')).toHaveCSS('border-left-width', '0px')
    await expect(cell(page, '9:2')).toHaveText(writer === 'all' ? 'SO-10001' : before!)
    await expect(cell(page, '9:1')).toHaveText(neighbour!)
    await expect(cell(page, '8:2')).not.toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await select(page, 'A1', '0:0')
    await expect(cell(page, '9:1')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
    await expect(cell(page, '9:1')).toHaveCSS('border-right-width', '3px')
    await expect(cell(page, '9:2')).toHaveText(before!)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await select(page, 'A1', '0:0')
    await expect(cell(page, '9:1')).toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
  })
}

for (const writer of ['painter', 'formats']) {
  test(`${writer} from an unformatted source clears all four shared edges`, async ({ page }) => {
    const before = await cell(page, '9:2').textContent()
    await sourceToTarget(page, writer, 'A5', '4:0')
    for (const [coord, side] of [
      ['9:1', 'right'], ['8:2', 'bottom'], ['9:2', 'right'], ['9:2', 'bottom'],
    ]) {
      await expect(cell(page, coord)).not.toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
    }
    await expect(cell(page, '9:2')).toHaveText(before!)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await select(page, 'A1', '0:0')
    await expect(cell(page, '9:1')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
  })
}

for (const action of ['Clear formatting', 'Clear all']) {
  test(`${action} clears neighbours in the same native history entry`, async ({ page }) => {
    const before = await cell(page, '9:2').textContent()
    const neighbour = await cell(page, '9:1').textContent()
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(cell(page, '9:2')).not.toHaveCSS('border-left-color', 'rgb(192, 0, 0)')
    await select(page, 'A1', '0:0')
    await expect(cell(page, '9:1')).not.toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
    await expect(cell(page, '9:2')).toHaveText(action === 'Clear all' ? '' : before!)
    await expect(cell(page, '9:1')).toHaveText(neighbour!)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await select(page, 'A1', '0:0')
    await expect(cell(page, '9:1')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
    await expect(cell(page, '9:2')).toHaveText(before!)
    await expect(cell(page, '9:1')).toHaveText(neighbour!)
  })
}

for (const axis of ['row', 'column']) {
  test(`clearing an entire ${axis} clears the neighbouring face and undoes once`, async ({ page }) => {
    if (axis === 'row') await page.getByRole('button', { name: 'Select row 10', exact: true }).click()
    else await page.getByRole('columnheader', { name: 'Select column C', exact: true }).click()
    const targetValue = await cell(page, '9:2').textContent()
    const peer = cell(page, axis === 'row' ? '8:2' : '9:1')
    const peerValue = await peer.textContent()
    const side = axis === 'row' ? 'bottom' : 'right'
    await expect(peer).toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
    await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
    await expect(peer).not.toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
    await expect(peer).toHaveText(peerValue!)
    await expect(cell(page, '9:2')).toHaveText(targetValue!)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(peer).toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
    await expect(peer).toHaveCSS(`border-${side}-width`, '3px')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(peer).not.toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
  })
}
