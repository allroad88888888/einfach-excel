import { expect, test, type Locator, type Page } from '@playwright/test'
import { withEnglishLocale } from '../helpers'

const gridSelector = '[data-testid="wave5-grid"]'

type Point = {
  readonly x: number
  readonly y: number
}

type WindowPointerEvent = 'pointermove' | 'pointerup' | 'pointercancel'

function cell(page: Page, address: string): Locator {
  return page.locator(gridSelector).locator(`td[data-cell-addr="${address}"]`)
}

function cellDisplay(page: Page, address: string): Locator {
  return cell(page, address).locator('.cell-display')
}

function fillHandle(page: Page, address: string): Locator {
  return page.getByTestId(`fill-handle-${address}`)
}

async function gotoWave5(page: Page): Promise<void> {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.locator(gridSelector)).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

async function center(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox()

  if (box === null) {
    throw new Error('Expected a visible pointer target')
  }

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }
}

async function startNativePointer(page: Page, handle: Locator): Promise<number> {
  await page.evaluate(() => {
    window.addEventListener(
      'pointerdown',
      (event) => {
        ;(window as Window & { __ui524PointerId?: number }).__ui524PointerId = event.pointerId
      },
      { capture: true, once: true },
    )
  })

  const point = await center(handle)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()

  return page.evaluate(() => {
    const target = window as Window & { __ui524PointerId?: number }
    const pointerId = target.__ui524PointerId
    delete target.__ui524PointerId

    if (pointerId === undefined) throw new Error('Expected the native pointerdown id')
    return pointerId
  })
}

async function dispatchWindowPointer(
  page: Page,
  type: WindowPointerEvent,
  pointerId: number,
  point: Point,
): Promise<void> {
  await page.evaluate(
    ({ type: eventType, pointerId: eventPointerId, point: eventPoint }) => {
      window.dispatchEvent(
        new PointerEvent(eventType, {
          bubbles: true,
          button: 0,
          buttons: eventType === 'pointermove' ? 1 : 0,
          cancelable: true,
          clientX: eventPoint.x,
          clientY: eventPoint.y,
          isPrimary: true,
          pointerId: eventPointerId,
          pointerType: 'mouse',
        }),
      )
    },
    { type, pointerId, point },
  )
}

test.describe('Wave5 fill handle pointer lifecycle', () => {
  test('commits a fill-handle drag with the expected copied values', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'B2').click()

    const handle = fillHandle(page, 'B2')
    const source = await center(handle)
    const destination = await center(cell(page, 'B4'))

    await page.mouse.move(source.x, source.y)
    await page.mouse.down()
    await page.mouse.move(destination.x, destination.y)
    await page.mouse.up()

    await expect(cellDisplay(page, 'B3')).toHaveText('120')
    await expect(cellDisplay(page, 'B4')).toHaveText('120')
    await expect(cell(page, 'B4')).not.toHaveClass(/cell-fill-preview/)
  })

  test('pointercancel clears the fill preview without committing', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'B2').click()

    const handle = fillHandle(page, 'B2')
    const destination = await center(cell(page, 'B4'))

    const pointerId = await startNativePointer(page, handle)
    await page.mouse.move(destination.x, destination.y)
    await expect(cell(page, 'B4')).toHaveClass(/cell-fill-preview/)

    await dispatchWindowPointer(page, 'pointercancel', pointerId, destination)
    await page.mouse.up()

    await expect(cell(page, 'B4')).not.toHaveClass(/cell-fill-preview/)
    await expect(cellDisplay(page, 'B3')).toHaveText('80')
    await expect(cellDisplay(page, 'B4')).toHaveText('200')
  })

  test('a non-initiating pointer cannot preview or commit a fill', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'B2').click()

    const handle = fillHandle(page, 'B2')
    const destination = await center(cell(page, 'B4'))

    const pointerId = await startNativePointer(page, handle)
    const otherPointerId = pointerId + 1
    await dispatchWindowPointer(page, 'pointermove', otherPointerId, destination)
    await dispatchWindowPointer(page, 'pointerup', otherPointerId, destination)

    await expect(cell(page, 'B4')).not.toHaveClass(/cell-fill-preview/)
    await expect(cellDisplay(page, 'B3')).toHaveText('80')
    await expect(cellDisplay(page, 'B4')).toHaveText('200')

    await dispatchWindowPointer(page, 'pointercancel', pointerId, destination)
    await page.mouse.up()
  })
})
