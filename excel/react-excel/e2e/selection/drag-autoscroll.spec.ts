import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390]) for (const edge of ['bottom', 'right', 'top', 'left', 'diagonal', 'release'])
  test(`${edge === 'release' ? 'release stops selection autoscroll and permits a new anchor'
    : `${edge} selection drag keeps scrolling without further pointer movement`} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    const name = page.getByRole('textbox', { name: 'Name box', exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('2')
    await bar.press('Enter')
    await expect(cell('1:6')).toHaveText('158')
    await button('Undo').click()
    await select(page, 'H300', '299:7')
    const original = await cell('299:7').innerText()
    const scroll = page.getByTestId('sheet-scroll')
    // 只移动真实滚动容器，把起点置于中央，保证四边都有足够空间。
    await scroll.evaluate(node => {
      const source = document.querySelector('[data-cell="299:7"]')!.getBoundingClientRect()
      const bounds = node.getBoundingClientRect()
      node.scrollTop += source.top - bounds.top - node.clientHeight / 2
      node.scrollLeft += source.left - bounds.left - node.clientWidth / 2
    })
    await expect(cell('299:7')).toBeVisible()
    const start = (await cell('299:7').boundingBox())!
    const before = await scroll.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }))
    const horizontal = ['right', 'left', 'diagonal', 'release'].includes(edge)
    const vertical = ['bottom', 'top', 'diagonal', 'release'].includes(edge)
    const target = await scroll.evaluate((node, side) => {
      const bounds = node.getBoundingClientRect()
      return { x: side === 'left' ? bounds.left + 3 : bounds.left + node.clientWidth - 3,
        y: side === 'top' ? bounds.top + 3 : bounds.top + node.clientHeight - 3 }
    }, edge)
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(horizontal ? target.x : start.x + start.width / 2,
      vertical ? target.y : start.y + start.height / 2)
    // 后面不再发 pointermove；必须由原生 rAF 持续滚动并更新选区。
    const moved = await scroll.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }))
    const sign = edge === 'top' || edge === 'left' ? -1 : 1
    await expect.poll(async () => scroll.evaluate((node, input) => Math.min(
      input.horizontal ? input.sign * (node.scrollLeft - input.start.x) : Infinity,
      input.vertical ? input.sign * (node.scrollTop - input.start.y) : Infinity,
    ), { horizontal, vertical, sign, start: moved })).toBeGreaterThan(120)
    const expected = edge === 'right' ? /^H300:[I-P]300$/ : edge === 'left' ? /^[A-G]300:H300$/
      : edge === 'bottom' ? /^H300:H\d+$/ : edge === 'top' ? /^H\d+:H300$/ : /^H300:[I-P]\d+$/
    await expect(name).toHaveValue(expected)
    expect(await name.inputValue()).not.toBe('H300')
    const after = await scroll.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }))
    if (!vertical) expect(after.y).toBe(before.y)
    if (!horizontal) expect(after.x).toBe(before.x)
    await page.mouse.up()
    const selected = await name.inputValue()
    const stopped = await scroll.evaluate(async node => {
      const frames = async () => {
        for (let i = 0; i < 6; i++) await new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve())
        })
      }
      await frames()
      const first = [node.scrollLeft, node.scrollTop]
      await frames()
      return { first, last: [node.scrollLeft, node.scrollTop] }
    })
    expect(stopped.last).toEqual(stopped.first)
    await expect(name).toHaveValue(selected)
    if (edge === 'release') {
      await page.mouse.move(target.x - 20, target.y - 20)
      await expect(name).toHaveValue(selected)
      await select(page, 'B3', '2:1')
      await expect(name).toHaveValue('B3')
      await expect(cell('2:1')).toHaveText('Northwind')
    }
    await expect(button('Undo')).toBeDisabled()
    await select(page, 'H300', '299:7')
    await expect(cell('299:7')).toHaveText(original)
    await button('Redo').click()
    await select(page, 'G2', '1:6')
    await expect(cell('1:6')).toHaveText('158')
    await expect(bar).toHaveValue('=E2*F2')
    await expect(cell('1:6')).toHaveCSS('font-family', 'Georgia')
  })
