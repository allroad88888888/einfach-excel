import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390]) for (const direction of ['left', 'right'])
  test(`fill handle ${direction} copies underline without changing source or neighbors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'D71', '70:3')
    const target = cell(page, direction === 'left' ? '70:2' : '70:5')
    await expect(target).toHaveText('')
    // 本例只验证水平复制；先用真实滚轮把目标移出底边自动滚动区，再按下拖拽。
    // 否则等待预览断言时，持续滚动会改变静止指针下的行，合法地转成向下填充。
    if (direction === 'left') {
      await target.scrollIntoViewIfNeeded()
      const scroll = page.getByTestId('sheet-scroll')
      const viewport = (await scroll.boundingBox())!
      await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2)
      await page.mouse.wheel(0, 168)
      await expect.poll(async () => {
        const box = (await target.boundingBox())!
        return viewport.y + viewport.height - (box.y + box.height / 2)
      }).toBeGreaterThan(48)
    }
    await page.getByRole('button', { name: 'Drag to fill', exact: true }).hover()
    await page.mouse.down()
    if (direction === 'right') await target.scrollIntoViewIfNeeded()
    const box = (await target.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('fill-preview')).toBeVisible()
    await expect(target).toHaveText('')
    await page.mouse.up()
    await expect(page.getByRole('textbox', { name: 'Name box', exact: true }))
      .toHaveValue(direction === 'left' ? 'C71:D71' : 'D71:F71')
    await expect(target).toHaveText('Fill me')
    await expect(target).toHaveCSS('text-decoration-line', 'underline')
    await expect(cell(page, '70:3')).toHaveText('Fill me')
    await expect(cell(page, '70:1')).toHaveText('4')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveText('')
    await expect(cell(page, '70:3')).toHaveCSS('text-decoration-line', 'underline')
    await expect(cell(page, '70:1')).toHaveText('4')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(target).toHaveText('Fill me')
    await expect(target).toHaveCSS('text-decoration-line', 'underline')
  })
