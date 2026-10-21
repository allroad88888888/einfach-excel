import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { cell, expectSelected, nameBox, openOrders } from './pointer'

async function dragSummaryPair(page: Page, from: number, to: number, append = false) {
  const scroll = page.getByTestId('sheet-scroll')
  // A93 starts near the lower edge; A:C is wider than the narrow viewport.
  // Center this pair's shared border, then use visible points on either side.
  await scroll.evaluate((node, pair) => {
    const source = node.querySelector(`td[data-cell="92:${pair.from}"]`)!.getBoundingClientRect()
    const target = node.querySelector(`td[data-cell="92:${pair.to}"]`)!.getBoundingClientRect()
    const bounds = node.getBoundingClientRect()
    node.scrollTop += source.top + source.height / 2 - (bounds.top + node.clientHeight / 2)
    node.scrollLeft += (source.right + target.left) / 2 - (bounds.left + node.clientWidth / 2)
  }, { from, to })
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  const points = () => scroll.evaluate((node, pair) => {
    const source = node.querySelector(`td[data-cell="92:${pair.from}"]`)!.getBoundingClientRect()
    const target = node.querySelector(`td[data-cell="92:${pair.to}"]`)!.getBoundingClientRect()
    const bounds = node.getBoundingClientRect()
    const start = { x: source.right - 12, y: source.top + source.height / 2 }
    const end = { x: target.left + 12, y: target.top + target.height / 2 }
    return { start, end, x: node.scrollLeft, y: node.scrollTop, width: node.clientWidth,
      height: node.clientHeight, inside: [start, end].every(point =>
        point.x >= bounds.left + 56 && point.x <= bounds.left + node.clientWidth - 56 &&
        point.y >= bounds.top + 56 && point.y <= bounds.top + node.clientHeight - 56) }
  }, { from, to })
  const stablePoints = async () => {
    await expect.poll(async () => {
      const before = await points()
      await page.evaluate(async () => {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      })
      const after = await points()
      return after.inside && JSON.stringify(before) === JSON.stringify(after)
    }).toBe(true)
    return points()
  }
  const initial = await stablePoints()
  if (append) await page.keyboard.down('Meta')
  try {
    await page.mouse.move(initial.start.x, initial.start.y)
    await page.mouse.down()
    // Appending adds a footer note: wait for its resize before resolving the endpoint.
    const settled = await stablePoints()
    await page.mouse.move(settled.end.x, settled.end.y, { steps: 4 })
    await page.mouse.up()
  } finally {
    if (append) await page.keyboard.up('Meta')
  }
}

for (const width of [1280, 390]) {
  test(`overlapping manual areas count and aggregate each cell once at ${width}px`, async ({ page }, info) => {
    await openOrders(page, width)
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'A93', '92:0')
    await dragSummaryPair(page, 0, 1)
    await expect(nameBox(page)).toHaveValue('A93:B93')
    await dragSummaryPair(page, 1, 2, true)
    await expect(nameBox(page)).toHaveValue('B93:C93')
    await expectSelected(page, 92, 0)
    await expectSelected(page, 92, 1)
    await expectSelected(page, 92, 2)
    await expectSelected(page, 92, 3, false)
    const status = page.getByRole('status', { name: 'Selection statistics', exact: true })
    await expect(status).toContainText('Numerical count: 3')
    await expect(status).toContainText('Sum: 6')
    await expect(status).toContainText('Average: 2')
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true }))
      .toContainText('3 cells selected in multiple areas')
    await expect(cell(page, 92, 3)).toHaveText('20')
    await page.screenshot({ path: info.outputPath(`overlap-statistics-${width}.png`) })
  })
}
