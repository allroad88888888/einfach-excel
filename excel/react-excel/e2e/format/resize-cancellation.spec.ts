import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const handle = (page: Page) => page.getByRole('separator', { name: 'Resize column B', exact: true })

async function drag(page: Page, pixels: number) {
  const box = (await handle(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + pixels, box.y + box.height / 2)
  await expect(page.locator('.resize-guide')).toBeVisible()
}

for (const width of [1280, 390]) for (const cancel of ['Escape', 'window blur'] as const)
  test(`${cancel} cancels resize without writing and a new drag still works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'H2', '1:7')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await bar.fill('Keep resize redo')
    await bar.press('Enter')
    await expect(cell(page, '1:7')).toHaveText('Keep resize redo')
    await undo.click()
    await expect(cell(page, '1:7')).toHaveText('Paid')
    await select(page, 'B2', '1:1')
    await drag(page, 60)
    expect((await cell(page, '1:1').boundingBox())!.width).toBe(120)
    await expect(undo).toBeDisabled()
    if (cancel === 'Escape') await page.keyboard.press('Escape')
    else {
      // 无头浏览器的标签切换不产生操作系统窗口失焦；仅注入 DOM 事件，后续写入仍走真实 Rust。
      await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')))
    }
    await page.mouse.up()
    await expect(page.locator('.resize-guide')).toHaveCount(0)
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '120')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(undo).toBeDisabled()
    await expect(redo).toBeEnabled()
    await redo.click()
    await select(page, 'H2', '1:7')
    await expect(cell(page, '1:7')).toHaveText('Keep resize redo')
    await undo.click()
    await expect(cell(page, '1:7')).toHaveText('Paid')
    await select(page, 'B2', '1:1')
    await drag(page, 30)
    await page.mouse.up()
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '150')
    await expect(redo).toBeDisabled()
    await undo.click()
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '120')
    await expect(undo).toBeDisabled()
    await redo.click()
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '150')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
  })
