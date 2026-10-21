import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { cell, expectSelected, nameBox, openOrders } from './pointer'

for (const width of [1280, 390]) {
  test(`modifier selection includes a merged area without selecting its gap at ${width}px`, async ({ page }, info) => {
    await openOrders(page, width)
    await select(page, 'A6:B7', '5:0')
    await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Merge cells', exact: true }).click()
    const merged = page.locator('[data-merged-cell][data-cell="5:0"]')
    await expect(merged).toBeVisible()
    await cell(page, 2, 0).click()
    await merged.click({ modifiers: ['Meta'], position: { x: 12, y: 12 } })
    await expect(nameBox(page)).toHaveValue('A6:B7')
    await expectSelected(page, 2, 0)
    await expectSelected(page, 4, 0, false)
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true }))
      .toContainText('5 cells selected in multiple areas')
    await page.getByRole('button', { name: 'Bold', exact: true }).click()
    await expect(merged).toHaveCSS('font-weight', '700')
    await expect(cell(page, 2, 0)).toHaveCSS('font-weight', '700')
    await expect(cell(page, 4, 0)).toHaveCSS('font-weight', '400')
    await page.screenshot({ path: info.outputPath(`merged-multi-selection-${width}.png`) })
  })

  test(`modifier drag from frozen cells appends into the scrolling pane at ${width}px`, async ({ page }, info) => {
    await openOrders(page, width)
    await select(page, 'B3', '2:1')
    await page.getByRole('combobox', { name: 'Freeze panes', exact: true }).selectOption('selection')
    await cell(page, 9, 1).click()
    const frozen = page.locator('[data-frozen-pane="corner"] td[data-cell="1:0"]')
    const start = (await frozen.boundingBox())!
    const end = (await cell(page, 5, 1).boundingBox())!
    await page.keyboard.down('Meta')
    await page.mouse.move(start.x + 12, start.y + 12)
    await page.mouse.down()
    await page.mouse.move(end.x + 12, end.y + 12, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.up('Meta')
    await expect(nameBox(page)).toHaveValue('A2:B6')
    await expect(cell(page, 9, 1)).toHaveAttribute('data-selected', 'true')
    await expect(frozen).toHaveAttribute('data-selected', 'true')
    await expectSelected(page, 7, 1, false)
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true }))
      .toContainText('11 cells selected in multiple areas')
    await page.screenshot({ path: info.outputPath(`frozen-multi-selection-${width}.png`) })
  })

  test(`Escape during modifier edge drag stops scrolling and rejects late movement at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    const start = (await cell(page, 5, 0).boundingBox())!
    const scroll = page.getByTestId('sheet-scroll')
    const edge = await scroll.evaluate(node => {
      const box = node.getBoundingClientRect()
      return { x: box.left + node.clientWidth - 3, y: box.top + node.clientHeight - 3 }
    })
    await page.keyboard.down('Meta')
    await page.mouse.move(start.x + 12, start.y + 12)
    await page.mouse.down()
    await page.mouse.move(edge.x, edge.y)
    await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(80)
    await page.keyboard.up('Meta')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true })).toHaveCount(0)
    const selected = await nameBox(page).inputValue()
    const positions = await scroll.evaluate(async node => {
      const frames = async () => {
        for (let index = 0; index < 6; index++)
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
      await frames()
      const before = [node.scrollLeft, node.scrollTop]
      await frames()
      return { before, after: [node.scrollLeft, node.scrollTop] }
    })
    expect(positions.after).toEqual(positions.before)
    await page.mouse.move(edge.x - 30, edge.y - 30)
    await page.mouse.up()
    await expect(nameBox(page)).toHaveValue(selected)
    await select(page, 'A3', '2:0')
    await expect(cell(page, 2, 0)).toHaveText('SO-10002')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
