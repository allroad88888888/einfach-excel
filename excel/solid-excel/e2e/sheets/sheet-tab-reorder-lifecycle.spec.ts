import { expect, test, type Locator, type Page } from '@playwright/test'

import { cellDisplay, expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

type Point = {
  readonly x: number
  readonly y: number
}

async function gotoWorkerDemo(page: Page): Promise<void> {
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

function tabs(page: Page): Locator {
  return page.getByTestId('vnext-worker-sheet-tabs')
}

function tabItem(page: Page, sheetId: string): Locator {
  return tabs(page).locator(`[data-sheet-tab-item][data-sheet-id="${sheetId}"]`)
}

async function center(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox()

  if (box === null) throw new Error('Expected a visible sheet-tab pointer target')

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function startNativePointer(page: Page, handle: Locator): Promise<void> {
  await page.evaluate(() => {
    window.addEventListener(
      'pointerdown',
      (event) => {
        ;(window as Window & { __sheetTabPointerId?: number }).__sheetTabPointerId = event.pointerId
      },
      { capture: true, once: true },
    )
  })

  const source = await center(handle)
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
}

async function cancelNativePointer(page: Page, point: Point): Promise<void> {
  await page.evaluate((eventPoint) => {
    const target = window as Window & { __sheetTabPointerId?: number }
    const pointerId = target.__sheetTabPointerId
    delete target.__sheetTabPointerId
    if (pointerId === undefined) throw new Error('Expected the native pointerdown id')

    window.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: eventPoint.x,
        clientY: eventPoint.y,
        isPrimary: true,
        pointerId,
        pointerType: 'mouse',
      }),
    )
  }, point)
}

async function moveOverFirstTab(page: Page): Promise<Point> {
  const box = await tabItem(page, 'sheet-1').boundingBox()
  if (box === null) throw new Error('Expected Sheet1 tab target')

  const point = { x: box.x + box.width / 4, y: box.y + box.height / 2 }
  await page.mouse.move(point.x, point.y)
  await expect(tabItem(page, 'sheet-3')).toHaveAttribute('data-reorder-active', 'true')
  await expect(tabItem(page, 'sheet-1')).toHaveAttribute('data-reorder-drop', 'before')
  return point
}

async function expectOriginalOrder(page: Page): Promise<void> {
  await expect(tabs(page).getByRole('tab')).toHaveText(['Sheet1', 'Sheet2', 'Sheet3'])
  await expect(tabItem(page, 'sheet-3')).toHaveAttribute('data-reorder-active', 'false')
  await expect(tabItem(page, 'sheet-1')).not.toHaveAttribute('data-reorder-drop')
}

test.describe('Sheet tab reorder pointer lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('Escape cancels an in-progress reorder without changing the sheet order', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    const handle = page.getByTestId('sheet-tab-reorder-sheet-3')
    await handle.focus()
    await startNativePointer(page, handle)
    await moveOverFirstTab(page)

    // Pointerdown prevents default, so preserving the existing focused handle
    // is the browser route that exposes the Escape cancellation affordance.
    await page.keyboard.press('Escape')
    await page.mouse.up()

    await expectOriginalOrder(page)
    await expectNoConsoleErrors(page)
  })

  test('pointercancel clears the drop marker without committing a reorder', async ({ page }) => {
    await gotoWorkerDemo(page)

    const handle = page.getByTestId('sheet-tab-reorder-sheet-3')
    await startNativePointer(page, handle)
    const target = await moveOverFirstTab(page)

    await cancelNativePointer(page, target)
    await page.mouse.up()

    await expectOriginalOrder(page)
    await expectNoConsoleErrors(page)
  })
})
