import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

// 取消只结束 DOM 拖拽；必须保留旧 redo，并允许下一次真实 Rust 填充。
for (const width of [1280, 390])
  for (const action of ['Escape', 'pointercancel', 'lost pointer capture', 'window blur'])
  test(`${action} cancels fill drag without losing redo and permits a fresh drag at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'H94', '93:7')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('fill redo')
    await bar.press('Enter')
    await expect(cell(page, '93:7')).toHaveText('fill redo')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '93:7')).toHaveText('')
    await select(page, 'A40:A41', '39:0')
    const handle = page.getByRole('button', { name: 'Drag to fill', exact: true })
    if (action === 'lost pointer capture') await handle.evaluate(node => {
      node.addEventListener('pointerdown', event => {
        node.setAttribute('data-test-pointer', String((event as PointerEvent).pointerId))
      }, { once: true })
      node.addEventListener('lostpointercapture', () => {
        node.setAttribute('data-test-lost', 'true')
      }, { once: true })
    })
    await handle.hover()
    await page.mouse.down()
    const target = cell(page, '43:0')
    await target.scrollIntoViewIfNeeded()
    const box = (await target.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('fill-preview')).toBeVisible()
    if (action === 'Escape') await page.keyboard.press(action)
    else if (action === 'pointercancel') await handle.dispatchEvent('pointercancel', { pointerId: 1 })
    else if (action === 'lost pointer capture') {
      await handle.evaluate(node => {
        const pointerId = Number(node.getAttribute('data-test-pointer'))
        if (!node.hasPointerCapture(pointerId)) throw new Error('Fill handle never captured pointer')
        node.releasePointerCapture(pointerId)
      })
      // 触发下一次原生指针事件，再确认浏览器实际派发了 lostpointercapture。
      await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1)
      await expect(handle).toHaveAttribute('data-test-lost', 'true')
    } else {
      // 明确注入窗口 blur；无头浏览器不能证明真实切换系统应用。
      await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')))
    }
    await expect(page.getByTestId('fill-preview')).toHaveCount(0)
    await page.mouse.up()
    await expect(page.getByTestId('fill-preview')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Name box', exact: true })).toHaveValue('A40:A41')
    await expect(target).toHaveText('')
    await expect(cell(page, '39:0')).toHaveText('1')
    await expect(cell(page, '40:0')).toHaveText('3')
    await expect(cell(page, '39:2')).toHaveCSS('font-style', 'italic')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await select(page, 'H94', '93:7')
    await expect(cell(page, '93:7')).toHaveText('fill redo')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await select(page, 'A40:A41', '39:0')
    await handle.hover()
    await page.mouse.down()
    const retryBox = (await target.boundingBox())!
    await page.mouse.move(retryBox.x + retryBox.width / 2, retryBox.y + retryBox.height / 2)
    await page.mouse.up()
    await expect(target).toHaveText('9')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveText('')
    await expect(cell(page, '39:0')).toHaveText('1')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
