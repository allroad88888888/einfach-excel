import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test('losing native pointer capture stops edge scrolling and permits a new selection', async ({
  page,
}) => {
  await page.goto('/')
  await select(page, 'A2', '1:0')
  const frame = page.locator('.sheet-grid-frame')
  await frame.evaluate((node) => {
    node.addEventListener('pointerdown', (event) => {
      node.setAttribute('data-test-pointer', String((event as PointerEvent).pointerId))
    }, { once: true })
    node.addEventListener('lostpointercapture', () => {
      node.setAttribute('data-test-lost', 'true')
    }, { once: true })
  })
  const start = (await page.locator('td[data-cell="1:0"]').boundingBox())!
  const scroll = page.getByTestId('sheet-scroll')
  const edge = await scroll.evaluate((node) => {
    const box = node.getBoundingClientRect()
    return { x: box.left + node.clientWidth - 3, y: box.top + node.clientHeight - 3 }
  })
  await page.mouse.move(start.x + 20, start.y + 10)
  await page.mouse.down()
  await page.mouse.move(edge.x, edge.y)
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
  // 真正释放浏览器捕获，而不是 dispatch 一个模拟的 lostpointercapture。
  await frame.evaluate((node) => {
    const pointerId = Number(node.getAttribute('data-test-pointer'))
    if (!node.hasPointerCapture(pointerId)) throw new Error('Grid never captured pointer')
    node.releasePointerCapture(pointerId)
  })
  await page.mouse.move(edge.x - 1, edge.y - 1)
  await expect(frame).toHaveAttribute('data-test-lost', 'true')
  const positions = await scroll.evaluate(async (node) => {
    const frames = async () => {
      for (let i = 0; i < 6; i++) await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
    await frames()
    const before = [node.scrollLeft, node.scrollTop]
    await frames()
    return { before, after: [node.scrollLeft, node.scrollTop] }
  })
  expect(positions.after).toEqual(positions.before)
  const name = page.getByRole('textbox', { name: 'Name box', exact: true })
  const selected = await name.inputValue()
  await page.mouse.move(edge.x - 30, edge.y - 30)
  await expect(name).toHaveValue(selected)
  await page.mouse.up()
  await select(page, 'B3', '2:1')
  await expect(name).toHaveValue('B3')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
